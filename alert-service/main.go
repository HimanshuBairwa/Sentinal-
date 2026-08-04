package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	kafkaBroker := os.Getenv("KAFKA_BROKERS")
	if kafkaBroker == "" {
		kafkaBroker = "localhost:9092"
	}

	// Initialize Redis
	redisClient := NewRedisClient(redisAddr)

	// Initialize DLQ Producer
	dlqProducer := NewKafkaProducer([]string{kafkaBroker}, "alerts.dlq")
	defer dlqProducer.Close()

	// Initialize Webhook Dispatcher
	dispatcher := NewWebhookDispatcher(dlqProducer, os.Getenv("WEBHOOK_ALLOWLIST"), os.Getenv("ENVIRONMENT"))

	// Initialize Kafka Consumer
	consumer := NewKafkaConsumer(
		[]string{kafkaBroker},
		"risk.decisions",
		"alert-service-group",
		redisClient,
		dispatcher,
		os.Getenv("ALERT_WEBHOOK_URL"),
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Run consumer
	go consumer.Start(ctx)
	log.Println("Alert Service started successfully...")

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Add Healthcheck endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
	go func() {
		if err := http.ListenAndServe(":8084", nil); err != nil {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	<-sigChan

	log.Println("Shutting down gracefully...")
	cancel()
}
