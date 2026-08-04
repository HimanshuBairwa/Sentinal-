package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
	"strings"

	"sentinel/analytics-service/internal/api"
	"sentinel/analytics-service/internal/batch"
	"sentinel/analytics-service/internal/kafka"
	"sentinel/analytics-service/internal/repository"
)

func main() {
	// Configuration (in reality this should come from env vars)
	clickhouseAddr := getEnv("CLICKHOUSE_ADDR", "localhost:9000")
	clickhouseDB := getEnv("CLICKHOUSE_DB", "default")
	clickhouseUser := getEnv("CLICKHOUSE_USER", "default")
	clickhousePass := getEnv("CLICKHOUSE_PASS", "")

	kafkaBrokers := splitCSV(getEnv("KAFKA_BROKERS", getEnv("KAFKA_BROKER", "localhost:9092")))
	kafkaGroupID := getEnv("KAFKA_GROUP_ID", "analytics-service-group")

	apiAddr := getEnv("API_ADDR", ":8083")

	// 1. Initialize ClickHouse Repo
	repo, err := repository.NewClickHouseRepo(clickhouseAddr, clickhouseDB, clickhouseUser, clickhousePass)
	if err != nil {
		log.Fatalf("Failed to initialize ClickHouse repository: %v", err)
	}
	defer repo.Close()

	// 2. Initialize Batching Engine
	// Batch size of 1000 events or 1 second flush interval
	engine := batch.NewEngine(repo, 1000, 1*time.Second)
	engine.Start(1)
	defer engine.Stop()

	// 3. Initialize Kafka Consumer
	topics := []string{"auth.events", "risk.decisions", "api.metrics", "alerts.fired"}
	consumers := make([]*kafka.Consumer, 0, len(topics))
	for _, topic := range topics {
		consumer := kafka.NewConsumer(kafkaBrokers, topic, kafkaGroupID+"-"+topic, engine)
		consumer.Start()
		consumers = append(consumers, consumer)
	}
	defer func() {
		for _, consumer := range consumers {
			consumer.Stop()
		}
	}()

	// 4. Initialize HTTP API
	server := api.NewServer(engine, repo)
	engine.SetEventHandler(server.BroadcastEvent)
	go func() {
		if err := server.Start(apiAddr); err != nil {
			log.Printf("HTTP server stopped: %v", err)
		}
	}()

	// 5. Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down Analytics Service...")
	if err := server.Stop(); err != nil {
		log.Printf("Error stopping HTTP server: %v", err)
	}
	log.Println("Analytics Service successfully shutdown")
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			result = append(result, value)
		}
	}
	return result
}
