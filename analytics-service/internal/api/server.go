package api

import (
	"log"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"
	"sentinel/analytics-service/internal/batch"
	"sentinel/analytics-service/internal/models"
	"sentinel/analytics-service/internal/repository"
)

type Server struct {
	app    *fiber.App
	engine *batch.Engine
	repo   repository.ClickHouseRepo
	hub    *Hub
}

func NewServer(engine *batch.Engine, repo repository.ClickHouseRepo) *Server {
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	app.Use(recover.New())
	app.Use(logger.New())

	hub := NewHub()
	go hub.Run()

	server := &Server{
		app:    app,
		engine: engine,
		repo:   repo,
		hub:    hub,
	}

	server.setupRoutes()
	return server
}

func (s *Server) setupRoutes() {
	// Dependency-aware health: reports ClickHouse state with the correct status
	// code so orchestrators and the dashboard see truth, not a hardcoded 200.
	s.app.Get("/health", func(c *fiber.Ctx) error {
		if err := s.repo.Ping(c.Context()); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"status": "degraded",
				"clickhouse": "error",
				"error": err.Error(),
			})
		}
		return c.JSON(fiber.Map{"status": "ok", "clickhouse": "ok"})
	})

	s.app.Post("/ingest", s.handleIngest)

	// WebSockets
	s.app.Use("/ws", s.hub.HandleWebSocket)
	s.app.Get("/ws", websocket.New(s.hub.WsHandler))
	s.app.Use("/api/v1/analytics/ws", s.hub.HandleWebSocket)
	s.app.Get("/api/v1/analytics/ws", websocket.New(s.hub.WsHandler))

	// Analytics Routes
	v1 := s.app.Group("/api/v1/analytics")
	v1.Get("/overview", s.handleOverview)
	v1.Get("/fraud-rate", s.handleFraudRate)
	v1.Get("/top-threats", s.handleTopThreats)
	v1.Get("/latency", s.handleLatency)
	v1.Get("/events", s.handleEvents)
	v1.Get("/geo", s.handleGeo)
}

func (s *Server) handleIngest(c *fiber.Ctx) error {
	var event models.Event
	if err := c.BodyParser(&event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid JSON"})
	}
	event.Normalize()

	if err := s.engine.AddEvent(c.UserContext(), &event); err != nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "analytics storage unavailable"})
	}
	return c.SendStatus(fiber.StatusAccepted)
}

func (s *Server) handleOverview(c *fiber.Ctx) error {
	data, err := s.repo.GetOverview(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

func (s *Server) handleFraudRate(c *fiber.Ctx) error {
	data, err := s.repo.GetFraudRate(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

func (s *Server) handleTopThreats(c *fiber.Ctx) error {
	data, err := s.repo.GetTopThreats(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

func (s *Server) handleLatency(c *fiber.Ctx) error {
	data, err := s.repo.GetLatency(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

func (s *Server) handleEvents(c *fiber.Ctx) error {
	limitStr := c.Query("limit", "50")
	offsetStr := c.Query("offset", "0")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 || limit > 500 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "limit must be between 1 and 500"})
	}
	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "offset must be non-negative"})
	}

	events, err := s.repo.GetEvents(c.Context(), limit, offset)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(events)
}

func (s *Server) handleGeo(c *fiber.Ctx) error {
	data, err := s.repo.GetGeo(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

func (s *Server) Start(addr string) error {
	log.Printf("Starting HTTP API on %s", addr)
	return s.app.Listen(addr)
}

func (s *Server) Stop() error {
	return s.app.Shutdown()
}

func (s *Server) BroadcastEvent(event *models.Event) {
	s.hub.BroadcastEvent(fiber.Map{"type": "analytics.event", "data": event})
}
