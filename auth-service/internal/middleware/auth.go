package middleware

import (
	"context"
	"net/http"
	"strings"

	"sentinel/auth-service/internal/service"
)

type contextKey string

const ClaimsKey contextKey = "claims"

// RequireAuth validates the JWT in the Authorization header
func RequireAuth(tokenService service.TokenService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "missing authorization header", http.StatusUnauthorized)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				http.Error(w, "invalid authorization header format", http.StatusUnauthorized)
				return
			}

			claims, err := tokenService.ValidateAccessToken(parts[1])
			if err != nil {
				http.Error(w, "invalid or expired token", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole enforces Role-Based Access Control
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(ClaimsKey).(*domain.CustomClaims)
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			hasRole := false
			for _, role := range allowedRoles {
				if claims.Role == role {
					hasRole = true
					break
				}
			}

			if !hasRole {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			
			next.ServeHTTP(w, r)
		})
	}
}
