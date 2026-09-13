package middleware

import (
	"net/http"
	"strings"
	"time"

	"sentinel/gateway/internal/metrics"
)

// RequestMetrics wraps any handler with per-route latency + throughput
// observation for the gateway's dependency-free Prometheus metrics.
// WebSocket upgrades are excluded from latency observation: their handlers
// block for the lifetime of the connection, which would poison the mean.
func RequestMetrics(route string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		metrics.ObserveRequestStarted()
		if isUpgrade(r) {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		next.ServeHTTP(w, r)
		metrics.ObserveRequest(route, http.StatusOK, time.Since(start))
	})
}

func isUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Connection"), "Upgrade") &&
		strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}
