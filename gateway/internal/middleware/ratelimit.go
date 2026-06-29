package middleware

import (
	"net"
	"net/http"
	"strings"
	
	"sentinel/gateway/internal/ratelimit"
)

func RateLimit(limiter ratelimit.Limiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			
			// Use IP Address as the rate limit key
			ip := r.Header.Get("X-Forwarded-For")
			if ip == "" {
				ip, _, _ = net.SplitHostPort(r.RemoteAddr)
			} else {
				// Take the first IP if it's a comma-separated list
				ips := strings.Split(ip, ",")
				ip = strings.TrimSpace(ips[0])
			}

			allowed, err := limiter.Allow(r.Context(), ip)
			if err != nil {
				// If Redis fails, we should fail open or closed? 
				// Usually fail open for availability, but log error.
				next.ServeHTTP(w, r)
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
