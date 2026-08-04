package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"sentinel/analytics-service/internal/models"
	"sentinel/analytics-service/internal/repository"
)

var countries = []string{"US", "GB", "CA", "IN", "CN", "BR", "RU", "DE", "FR", "JP"}
var ips = []string{"192.168.1.1", "10.0.0.5", "172.16.0.1", "8.8.8.8", "1.1.1.1", "203.0.113.5", "198.51.100.14"}
var events = []string{"login", "signup", "transaction", "password_reset", "fraud_attempt"}

func main() {
	repo, err := repository.NewClickHouseRepo("sentinel-clickhouse:9000", "default", "sentinel", "sentinel_dev_only")
	if err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	defer repo.Close()

	ctx := context.Background()
	var batch []*models.Event

	now := time.Now()
	rand.Seed(time.Now().UnixNano())

	log.Println("Seeding 10,000 events...")

	for i := 0; i < 10000; i++ {
		// random time within the last 24 hours
		ts := now.Add(-time.Duration(rand.Intn(24*60)) * time.Minute)
		
		riskScore := rand.Float64()
		latency := rand.Float64() * 200 // max 200ms
		country := countries[rand.Intn(len(countries))]
		
		// 10% chance to have a high risk score for synthetic fraud
		if rand.Float64() > 0.9 {
			riskScore = 0.8 + (rand.Float64() * 0.2) // 0.8 to 1.0
		}

		payload := fmt.Sprintf(`{"risk_score": %.2f, "latency": %.2f, "country": "%s"}`, riskScore, latency, country)

		event := &models.Event{
			ID:        uuid.New().String(),
			SessionID: uuid.New().String(),
			UserID:    fmt.Sprintf("user_%d", rand.Intn(1000)),
			EventType: events[rand.Intn(len(events))],
			Payload:   payload,
			IPAddress: ips[rand.Intn(len(ips))],
			UserAgent: "Mozilla/5.0",
			Timestamp: ts,
		}

		batch = append(batch, event)

		if len(batch) >= 1000 {
			if err := repo.InsertBatch(ctx, batch); err != nil {
				log.Fatalf("Batch insert failed: %v", err)
			}
			batch = batch[:0]
		}
	}

	if len(batch) > 0 {
		if err := repo.InsertBatch(ctx, batch); err != nil {
			log.Fatalf("Final batch insert failed: %v", err)
		}
	}

	log.Println("Successfully inserted 10,000 sample events.")
}
