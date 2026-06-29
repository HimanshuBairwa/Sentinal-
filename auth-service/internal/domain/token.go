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

func (c *CustomClaims) GetAudience() (jwt.ClaimStrings, error) {
	return c.RegisteredClaims.Audience, nil
}

func (c *CustomClaims) GetExpirationTime() (*jwt.NumericDate, error) {
	return c.RegisteredClaims.ExpiresAt, nil
}

func (c *CustomClaims) GetIssuedAt() (*jwt.NumericDate, error) {
	return c.RegisteredClaims.IssuedAt, nil
}

func (c *CustomClaims) GetIssuer() (string, error) {
	return c.RegisteredClaims.Issuer, nil
}

func (c *CustomClaims) GetNotBefore() (*jwt.NumericDate, error) {
	return c.RegisteredClaims.NotBefore, nil
}

func (c *CustomClaims) GetSubject() (string, error) {
	return c.RegisteredClaims.Subject, nil
}
