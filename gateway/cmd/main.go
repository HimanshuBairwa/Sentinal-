package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sentinel/gateway/internal/config"
	"sentinel/gateway/internal/middleware"
	"sentinel/gateway/internal/proxy"
	"sentinel/gateway/internal/ratelimit"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.LoadConfig()

	// 1. Initialize Redis for Rate Limiting
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Unable to parse Redis URL: %v", err)
	}
	redisClient := redis.NewClient(opt)
	defer redisClient.Close()

	// Ensure Redis is reachable
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Redis connection failed: %v", err)
	}

	rateLimiter := ratelimit.NewSlidingWindowLimiter(redisClient, cfg.RateLimitRequests, 1*time.Minute)

	// 2. Fetch RSA Public Key from Auth Service
	log.Printf("Fetching public key from Auth Service at %s...", cfg.AuthServiceURL)
	pubKey, err := middleware.FetchPublicKey(cfg.AuthServiceURL)
	if err != nil {
		log.Fatalf("Failed to fetch public key: %v", err)
	}
	log.Println("Successfully loaded RSA public key for JWT validation.")

	authMiddleware := middleware.NewAuthMiddleware(pubKey)

	// 3. Initialize Reverse Proxies
	authProxy, err := proxy.NewReverseProxy(cfg.AuthServiceURL)
	if err != nil {
		log.Fatalf("Failed to create auth proxy: %v", err)
	}

	riskProxy, err := proxy.NewReverseProxy(cfg.RiskEngineURL)
	if err != nil {
		log.Fatalf("Failed to create risk proxy: %v", err)
	}

	analyticsProxy, err := proxy.NewReverseProxy(cfg.AnalyticsSvcURL)
	if err != nil {
		log.Fatalf("Failed to create analytics proxy: %v", err)
	}

	// 4. Setup Router
	r := chi.NewRouter()

	// Global Middlewares
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.RateLimit(rateLimiter)) // DDoS Protection First

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Gateway Healthy"))
	})

	// 5. Mount Routes
	
	// Public routes (Auth)
	r.Handle("/api/v1/auth/*", authProxy)

	// Protected routes (Risk Engine & Analytics)
	r.Group(func(r chi.Router) {
		r.Use(authMiddleware.VerifyJWT) // Verify JWT locally before forwarding!
		
		r.Handle("/api/v1/risk/*", riskProxy)
		r.Handle("/api/v1/analytics/*", analyticsProxy)
	})

	// 6. Start Server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("API Gateway starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down Gateway...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Gateway forced to shutdown:", err)
	}

	log.Println("Gateway exiting")
}
