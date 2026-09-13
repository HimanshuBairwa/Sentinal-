package api

import (
	"log"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

const (
	// writeTimeout bounds a single client write. A slow/stuck client gets
	// dropped instead of blocking the broadcast loop for everyone else
	// (fixes head-of-line blocking).
	writeTimeout = 5 * time.Second

	// clientBuffer is the per-client outbound queue. If a client can't keep
	// up, frames are dropped for that client only — never for the group.
	clientBuffer = 64

	// pingInterval keeps intermediaries from closing idle connections.
	pingInterval = 30 * time.Second
)

// client is one connected dashboard subscriber.
type client struct {
	conn *websocket.Conn
	send chan interface{}
}

// Hub fans out analytics events to all connected dashboard clients.
type Hub struct {
	clients    map[*client]struct{}
	clientsMux sync.Mutex
	Broadcast  chan interface{}
	register   chan *client
	unregister chan *client
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*client]struct{}),
		Broadcast:  make(chan interface{}, 256),
		register:   make(chan *client),
		unregister: make(chan *client),
	}
}

// Run is the single fan-out goroutine. It never performs a blocking write:
// per-client goroutines own their connections, so a slow client cannot stall
// the group.
func (h *Hub) Run() {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case c := <-h.register:
			h.clientsMux.Lock()
			h.clients[c] = struct{}{}
			h.clientsMux.Unlock()
		case c := <-h.unregister:
			h.clientsMux.Lock()
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				close(c.send)
			}
			h.clientsMux.Unlock()
		case msg := <-h.Broadcast:
			h.clientsMux.Lock()
			for c := range h.clients {
				// Non-blocking enqueue: drop frame for a lagging client
				// rather than stall the producer or the whole group.
				select {
				case c.send <- msg:
				default:
					log.Println("analytics websocket client lagging; dropping frame")
				}
			}
			h.clientsMux.Unlock()
		case <-ticker.C:
			h.clientsMux.Lock()
			for c := range h.clients {
				select {
				case c.send <- nil: // nil = ping
				default:
				}
			}
			h.clientsMux.Unlock()
		}
	}
}

// BroadcastEvent enqueues a live event without ever blocking the caller.
func (h *Hub) BroadcastEvent(event interface{}) {
	select {
	case h.Broadcast <- event:
	default:
		log.Println("analytics websocket broadcast buffer full; dropping live update")
	}
}

func (h *Hub) HandleWebSocket(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("allowed", true)
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// WsHandler registers a client and pumps its outbound queue. The read loop
// drains control frames (pong/close) so the kernel buffers never fill.
func (h *Hub) WsHandler(conn *websocket.Conn) {
	c := &client{conn: conn, send: make(chan interface{}, clientBuffer)}
	h.register <- c

	defer func() {
		h.unregister <- c
		conn.Close()
	}()

	// Writer goroutine: owns all writes with a deadline.
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		for msg := range c.send {
			if msg == nil { // ping
				_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
				continue
			}
			_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := conn.WriteJSON(msg); err != nil {
				return
			}
		}
	}()

	// Reader: drains inbound frames; we expect none, but must consume them.
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
	<-writerDone
}
