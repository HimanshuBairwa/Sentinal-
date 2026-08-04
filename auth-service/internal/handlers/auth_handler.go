package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

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

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1048576) // 1MB Limit
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ipAddress := r.RemoteAddr

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
	r.Body = http.MaxBytesReader(w, r.Body, 1048576) // 1MB Limit
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	ipAddress := r.RemoteAddr

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
