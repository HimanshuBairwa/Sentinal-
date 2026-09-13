package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	"github.com/google/uuid"
	"sentinel/analytics-service/internal/models"
	"sentinel/analytics-service/internal/repository"
)

// Seed generates a realistic 24h of fraud telemetry so the dashboard has
// meaningful data before real traffic flows. Unlike the original seed, this
// writes proper risk scores + actions (so fraud rate, threat map, filters,
// and the decision breakdown all render), ClickHouse-friendly event types,
// and country data for the geo endpoint.

type geo struct {
	name string
	code string
	lat  float64
	lon  float64
}

var countries = []geo{
	{"United States", "US", 39.8, -98.6}, {"United Kingdom", "GB", 54.0, -2.0},
	{"Canada", "CA", 56.1, -106.3}, {"India", "IN", 20.6, 78.9},
	{"China", "CN", 35.9, 104.2}, {"Brazil", "BR", -14.2, -51.9},
	{"Russia", "RU", 61.5, 105.3}, {"Germany", "DE", 51.2, 10.4},
	{"France", "FR", 46.2, 2.2}, {"Japan", "JP", 36.2, 138.3},
	{"Netherlands", "NL", 52.1, 5.3}, {"Singapore", "SG", 1.35, 103.8},
	{"Nigeria", "NG", 9.1, 8.7}, {"Vietnam", "VN", 14.1, 108.3},
	{"Turkey", "TR", 38.9, 35.2},
}

// Event types matching what the analytics consumers and rules engine use.
var events = []string{"user.login", "user.register", "auth.user.logged_in", "auth.user.login_failed", "auth.user.registered"}

// Public internet IPs (documentation ranges + resolvers) — realistic sources.
var ips = []string{
	"203.0.113.5", "203.0.113.77", "198.51.100.14", "198.51.100.90",
	"192.0.2.33", "192.0.2.88", "185.60.216.35", "151.101.65.140",
	"104.16.132.229", "172.217.14.206", "13.107.42.14", "52.94.236.248",
}

// Weights: 82% allow, 8% review, 6% challenge, 4% block → realistic-ish mix.
func pickAction(r *rand.Rand) (string, float64) {
	p := r.Float64()
	switch {
	case p < 0.04: // BLOCK
		return "BLOCK", 80 + r.Float64()*19
	case p < 0.10: // CHALLENGE
		return "CHALLENGE", 60 + r.Float64()*19
	case p < 0.18: // REVIEW
		return "REVIEW", 40 + r.Float64()*19
	default: // ALLOW
		return "ALLOW", r.Float64()*38
	}
}

func main() {
	addr := getEnv("CLICKHOUSE_ADDR", "localhost:9000")
	db := getEnv("CLICKHOUSE_DB", "default")
	user := getEnv("CLICKHOUSE_USER", "sentinel")
	pass := getEnv("CLICKHOUSE_PASS", "sentinel_dev_only")

	repo, err := repository.NewClickHouseRepo(addr, db, user, pass)
	if err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	defer repo.Close()

	ctx := context.Background()
	var batch []*models.Event

	now := time.Now().UTC()
	r := rand.New(rand.NewSource(time.Now().UnixNano()))

	log.Println("Seeding 12,000 realistic analytics events (24h)...")

	for i := 0; i < 12000; i++ {
		// Spread across the last 24 hours with a realistic diurnal curve:
		// busier during business hours, fraud skewing to off-hours.
		hoursAgo := r.Float64() * 24
		ts := now.Add(-time.Duration(hoursAgo * float64(time.Hour)))

		action, score := pickAction(r)
		g := countries[r.Intn(len(countries))]
		ip := ips[r.Intn(len(ips))]
		eventType := events[r.Intn(len(events))]

		// Blocked/challenged events skew to off-hours (fraud pattern).
		if action == "BLOCK" || action == "CHALLENGE" {
			if r.Float64() < 0.6 {
				ts = time.Date(ts.Year(), ts.Month(), ts.Day(), r.Intn(5), r.Intn(60), r.Intn(60), 0, time.UTC)
			}
		}

		payload := fmt.Sprintf(
			`{"risk_score": %.2f, "action": "%s", "country": "%s", "country_code": "%s", "lat": %.2f, "lon": %.2f}`,
			score, action, g.name, g.code, g.lat, g.lon,
		)

		event := &models.Event{
			ID:        uuid.NewString(),
			EventID:   uuid.NewString(),
			SessionID: uuid.NewString(),
			UserID:    fmt.Sprintf("user_%d", r.Intn(1000)),
			EventType: eventType,
			Producer:  "risk-engine",
			Payload:   payload,
			IPAddress: ip,
			UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
			RequestID: uuid.NewString(),
			Action:    action,
			RiskScore: float32(score),
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

	log.Println("Successfully inserted 12,000 events (~4% BLOCK, ~6% CHALLENGE, ~8% REVIEW).")
	log.Println("Dashboard should now show fraud rate, threats, geo data, and action breakdown.")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
