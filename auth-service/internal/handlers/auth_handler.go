package handlers

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"

	"sentinel/auth-service/internal/domain"
	"sentinel/auth-service/internal/middleware"
	"sentinel/auth-service/internal/service"
	"github.com/google/uuid"
)

type AuthHandler struct {
	authService *service.AuthService
	tokenSvc    service.TokenService
}

func NewAuthHandler(as *service.AuthService, ts service.TokenService) *AuthHandler {
	return &AuthHandler{
		authService: as,
		tokenSvc:    ts,
	}
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	FullName string `json:"full_name"`
}

// clientIP resolves the true client IP for fraud telemetry.
//
// The gateway strips untrusted identity headers from public requests, so when
// a request arrives at the auth service, X-Forwarded-For is only present if the
// gateway (or another trusted hop) put it there. We prefer, in order:
//  1. X-Forwarded-For (first entry — the original client)
//  2. X-Real-IP
//  3. RemoteAddr (direct connection)
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// First IP in the chain is the originating client.
		if ip := strings.TrimSpace(strings.Split(xff, ",")[0]); ip != "" {
			return normalizeIP(ip)
		}
	}
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		return normalizeIP(ip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return normalizeIP(r.RemoteAddr)
	}
	return normalizeIP(host)
}

func normalizeIP(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return "0.0.0.0"
	}
	return parsed.String()
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1048576) // 1MB limit
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ipAddress := clientIP(r)

	user, err := h.authService.RegisterUser(r.Context(), req.Email, req.Password, req.FullName, ipAddress)
	if err != nil {
		if err == domain.ErrWeakPassword || err == domain.ErrInvalidEmail {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, "registration failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1048576) // 1MB limit
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ipAddress := clientIP(r)

	deviceInfo := map[string]any{
		"user_agent": r.UserAgent(),
	}

	tokenPair, err := h.authService.Login(r.Context(), req.Email, req.Password, ipAddress, r.UserAgent(), deviceInfo)
	if err != nil {
		if err == domain.ErrInvalidPassword || err == domain.ErrAccountLocked || err == domain.ErrAccountInactive {
			http.Error(w, err.Error(), http.StatusUnauthorized)
			return
		}
		http.Error(w, "login failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokenPair)
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.RefreshToken) == "" {
		http.Error(w, "invalid refresh request", http.StatusBadRequest)
		return
	}
	pair, err := h.authService.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		http.Error(w, "invalid or expired refresh token", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pair)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*domain.CustomClaims)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	sessionID, err := uuid.Parse(claims.SessionID)
	if err != nil || h.authService.Logout(r.Context(), sessionID) != nil {
		http.Error(w, "logout failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(middleware.ClaimsKey).(*domain.CustomClaims)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"user_id": claims.Subject,
		"email":   claims.Email,
		"role":    claims.Role,
	})
}

func (h *AuthHandler) PublicKey(w http.ResponseWriter, r *http.Request) {
	pemBytes, err := service.GetPublicKeyPEM(h.tokenSvc.GetPublicKey())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/x-pem-file")
	w.Write(pemBytes)
}

// Health reports dependency state (DB + Redis) with a correct status code so
// orchestrators and the dashboard see real health, not a hardcoded 200.
func (h *AuthHandler) Health(deps HealthDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		dbOK := deps.PingDB(ctx)
		redisOK := deps.PingRedis(ctx)
		status := http.StatusOK
		healthy := dbOK && redisOK
		if !healthy {
			status = http.StatusServiceUnavailable
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]any{
			"status": map[bool]string{true: "ok", false: "degraded"}[healthy],
			"db":     map[bool]string{true: "ok", false: "error"}[dbOK],
			"redis":  map[bool]string{true: "ok", false: "error"}[redisOK],
		})
	}
}

// HealthDeps lets the router inject ping functions without import cycles.
type HealthDeps struct {
	PingDB    func(ctx context.Context) bool
	PingRedis func(ctx context.Context) bool
}
