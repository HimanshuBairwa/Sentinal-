package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	// Initialize Redis
	redisClient := NewRedisClient("localhost:6379")

	// Initialize DLQ Producer
	dlqProducer := NewKafkaProducer([]string{"localhost:9092"}, "alert-dlq")
	defer dlqProducer.Close()

	// Initialize Webhook Dispatcher
	dispatcher := NewWebhookDispatcher(dlqProducer)

	// Initialize Kafka Consumer
	consumer := NewKafkaConsumer(
		[]string{"localhost:9092"},
		"alert-events",
		"alert-service-group",
		redisClient,
		dispatcher,
	)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Run consumer
	go consumer.Start(ctx)
	log.Println("Alert Service started successfully...")

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down gracefully...")
	cancel()
}
