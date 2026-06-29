package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sentinel/auth-service/internal/config"
	"sentinel/auth-service/internal/handlers"
	"sentinel/auth-service/internal/kafka"
	"sentinel/auth-service/internal/repository"
	"sentinel/auth-service/internal/service"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.LoadConfig()

	// 1. Setup Postgres
	ctx := context.Background()
	dbPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer dbPool.Close()

	// 2. Setup Redis
	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Unable to parse Redis URL: %v\n", err)
	}
	redisClient := redis.NewClient(opt)
	defer redisClient.Close()

	// 3. Setup Kafka Producer
	kafkaProducer := kafka.NewProducer(cfg.KafkaBrokers, "auth.events")
	defer kafkaProducer.Close()

	// 4. Setup RSA Keys (Persistent)
	privKey, err := service.LoadOrGenerateRSAKey("jwtRS256.key")
	if err != nil {
		log.Fatalf("Failed to generate RSA key: %v", err)
	}

	// 5. Initialize Repositories
	userRepo := repository.NewUserPostgres(dbPool)
	sessionRepo := repository.NewSessionRedis(redisClient)

	// 6. Initialize Services
	tokenService := service.NewJWTTokenService(privKey, cfg.AccessTTL, cfg.RefreshTTL, cfg.Issuer)
	authService := service.NewAuthService(userRepo, sessionRepo, tokenService, kafkaProducer)

	// 7. Initialize HTTP Handlers & Router
	authHandler := handlers.NewAuthHandler(authService, tokenService)
	router := handlers.NewRouter(authHandler, tokenService)

	// 8. Start HTTP Server with Graceful Shutdown
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		log.Printf("Auth Service starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %s\n", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exiting")
}
