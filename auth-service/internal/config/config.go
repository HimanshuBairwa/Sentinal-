package config

import (
	"os"
	"time"
)

type Config struct {
	Port         string
	DatabaseURL  string
	RedisURL     string
	KafkaBrokers []string
	AccessTTL    time.Duration
	RefreshTTL   time.Duration
	Issuer       string
}

func LoadConfig() *Config {
	// In production, we'd use viper to load from env/yaml.
	// For now, we fallback to defaults for fast local dev.
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		dbUrl = "postgres://sentinel:sentinel_dev_secret@localhost:5432/sentinel?sslmode=disable"
	}

	redisUrl := os.Getenv("REDIS_URL")
	if redisUrl == "" {
		redisUrl = "redis://localhost:6379/0"
	}

	kafkaBroker := os.Getenv("KAFKA_BROKER")
	if kafkaBroker == "" {
		kafkaBroker = "localhost:9092"
	}

	return &Config{
		Port:         port,
		DatabaseURL:  dbUrl,
		RedisURL:     redisUrl,
		KafkaBrokers: []string{kafkaBroker},
		AccessTTL:    15 * time.Minute,
		RefreshTTL:   7 * 24 * time.Hour,
		Issuer:       "sentinel-auth-service",
	}
}
