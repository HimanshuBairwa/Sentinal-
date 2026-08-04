package config

import (
	"os"
	"strconv"
	"strings"
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
	Audience     string
	JWTKeyPath   string
	JWTKeyID     string
	KafkaTopic   string
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

	kafkaBrokers := splitCSV(getEnv("KAFKA_BROKERS", getEnv("KAFKA_BROKER", "localhost:9092")))

	return &Config{
		Port:         port,
		DatabaseURL:  dbUrl,
		RedisURL:     redisUrl,
		KafkaBrokers: kafkaBrokers,
		AccessTTL:    durationFromSeconds("ACCESS_TOKEN_TTL_SECONDS", 15*time.Minute),
		RefreshTTL:   durationFromSeconds("REFRESH_TOKEN_TTL_SECONDS", 7*24*time.Hour),
		Issuer:       getEnv("JWT_ISSUER", "sentinel-auth-service"),
		Audience:     getEnv("JWT_AUDIENCE", "sentinel-api"),
		JWTKeyPath:   getEnv("JWT_PRIVATE_KEY_PATH", "/var/lib/sentinel/keys/jwtRS256.key"),
		JWTKeyID:     getEnv("JWT_KEY_ID", "sentinel-2026-01"),
		KafkaTopic:   getEnv("KAFKA_AUTH_EVENTS_TOPIC", "auth.events"),
	}
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
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

func durationFromSeconds(key string, fallback time.Duration) time.Duration {
	seconds, err := strconv.Atoi(os.Getenv(key))
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}
