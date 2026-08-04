package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port              string
	RedisURL          string
	AuthServiceURL    string
	RiskEngineURL     string
	AnalyticsSvcURL   string
	RateLimitRequests int
	JWTIssuer         string
	JWTAudience       string
	TrustProxy        bool
	CORSAllowedOrigins []string
}

func LoadConfig() *Config {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	redisUrl := os.Getenv("REDIS_URL")
	if redisUrl == "" {
		redisUrl = "redis://localhost:6379/0"
	}

	authURL := os.Getenv("AUTH_SERVICE_URL")
	if authURL == "" {
		authURL = "http://localhost:8081"
	}

	riskURL := os.Getenv("RISK_ENGINE_URL")
	if riskURL == "" {
		riskURL = "http://localhost:8082"
	}

	analyticsURL := os.Getenv("ANALYTICS_SERVICE_URL")
	if analyticsURL == "" {
		analyticsURL = "http://localhost:8083"
	}

	rateLimitStr := os.Getenv("RATE_LIMIT_REQUESTS")
	rateLimit, err := strconv.Atoi(rateLimitStr)
	if err != nil || rateLimit == 0 {
		rateLimit = 100 // 100 req per minute
	}

	return &Config{
		Port:              port,
		RedisURL:          redisUrl,
		AuthServiceURL:    authURL,
		RiskEngineURL:     riskURL,
		AnalyticsSvcURL:   analyticsURL,
		RateLimitRequests: rateLimit,
		JWTIssuer:         getEnv("JWT_ISSUER", "sentinel-auth-service"),
		JWTAudience:       getEnv("JWT_AUDIENCE", "sentinel-api"),
		TrustProxy:        strings.EqualFold(getEnv("TRUST_PROXY", "false"), "true"),
		CORSAllowedOrigins: splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")),
	}
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

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
