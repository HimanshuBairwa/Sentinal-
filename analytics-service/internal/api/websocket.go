package api

import (
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

type Hub struct {
	clients    map[*websocket.Conn]bool
	clientsMux sync.Mutex
	Broadcast  chan interface{}
}

func (h *Hub) BroadcastEvent(event interface{}) {
	select {
	case h.Broadcast <- event:
	default:
		log.Println("analytics websocket broadcast buffer full; dropping live update")
	}
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*websocket.Conn]bool),
		Broadcast: make(chan interface{}, 256),
	}
}

func (h *Hub) Run() {
	for {
		msg := <-h.Broadcast
		h.clientsMux.Lock()
		for client := range h.clients {
			if err := client.WriteJSON(msg); err != nil {
				log.Println("websocket write error:", err)
				client.Close()
				delete(h.clients, client)
			}
		}
		h.clientsMux.Unlock()
	}
}

func (h *Hub) HandleWebSocket(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("allowed", true)
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

func (h *Hub) WsHandler(c *websocket.Conn) {
	h.clientsMux.Lock()
	h.clients[c] = true
	h.clientsMux.Unlock()

	defer func() {
		h.clientsMux.Lock()
		delete(h.clients, c)
		h.clientsMux.Unlock()
		c.Close()
	}()

	// Keep connection alive
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			break
		}
	}
}
