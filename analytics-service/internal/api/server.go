package api

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"sentinel/analytics-service/internal/batch"
	"sentinel/analytics-service/internal/models"
)

type Server struct {
	app    *fiber.App
	engine *batch.Engine
}

func NewServer(engine *batch.Engine) *Server {
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	app.Use(recover.New())
	app.Use(logger.New())

	server := &Server{
		app:    app,
		engine: engine,
	}

	server.setupRoutes()
	return server
}

func (s *Server) setupRoutes() {
	s.app.Get("/health", func(c *fiber.Ctx) error {
		return c.SendString("OK")
	})

	s.app.Post("/ingest", s.handleIngest)
}

func (s *Server) handleIngest(c *fiber.Ctx) error {
	var event models.Event
	if err := c.BodyParser(&event); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid JSON",
		})
	}

	s.engine.AddEvent(&event)

	return c.SendStatus(fiber.StatusAccepted)
}

func (s *Server) Start(addr string) error {
	log.Printf("Starting HTTP API on %s", addr)
	return s.app.Listen(addr)
}

func (s *Server) Stop() error {
	return s.app.Shutdown()
}
