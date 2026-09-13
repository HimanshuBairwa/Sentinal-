package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"sentinel/auth-service/internal/middleware"
	"sentinel/auth-service/internal/service"
)

func NewRouter(authHandler *AuthHandler, tokenService service.TokenService, health HealthDeps) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	r.Get("/health", authHandler.Health(health))

	r.Route("/api/v1/auth", func(r chi.Router) {
		// Public routes
		r.Post("/register", authHandler.Register)
		r.Post("/login", authHandler.Login)
		r.Post("/refresh", authHandler.Refresh)
		r.Get("/public-key", authHandler.PublicKey)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth(tokenService))
			r.Get("/me", authHandler.Me)
			r.Post("/logout", authHandler.Logout)
			
			// Admin only route example
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireRole("admin"))
				r.Get("/admin-stats", func(w http.ResponseWriter, r *http.Request) {
					w.Write([]byte("super secret admin stats"))
				})
			})
		})
	})

	return r
}
