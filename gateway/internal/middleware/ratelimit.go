package middleware

import (
	"log"
	"net"
	"net/http"
	"strings"
	
	"sentinel/gateway/internal/ratelimit"
)

func RateLimit(limiter ratelimit.Limiter, trustProxy bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			
			// Use IP Address as the rate limit key
			ip, _, _ := net.SplitHostPort(r.RemoteAddr)
			if ip == "" {
				ip = r.RemoteAddr
			}
			if trustProxy {
				forwarded := r.Header.Get("X-Forwarded-For")
				if forwarded != "" {
				// Take the first IP if it's a comma-separated list
				ips := strings.Split(forwarded, ",")
				ip = strings.TrimSpace(ips[0])
				}
			}

			allowed, err := limiter.Allow(r.Context(), ip)
			if err != nil {
				log.Printf("rate limiter unavailable: %v", err)
				http.Error(w, "rate limiting temporarily unavailable", http.StatusServiceUnavailable)
				return
			}

			if !allowed {
				http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
