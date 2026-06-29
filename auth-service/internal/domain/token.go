package domain

import (
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // Access token expiry in seconds
}

// CustomClaims represents the standard JWT claims plus our custom sentinel claims
type CustomClaims struct {
	Email     string `json:"email"`
	Role      string `json:"role"`
	SessionID string `json:"session_id"`
	jwt.RegisteredClaims
}

// Ensure our custom claims implement the jwt.Claims interface
var _ jwt.Claims = (*CustomClaims)(nil)
