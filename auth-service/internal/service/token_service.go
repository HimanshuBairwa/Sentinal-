package service

import (
	"crypto/rand"
	"crypto/rsa"
	"time"

	"sentinel/auth-service/internal/domain"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type TokenService interface {
	GenerateTokenPair(user *domain.User, sessionID uuid.UUID) (*domain.TokenPair, error)
	ValidateAccessToken(tokenString string) (*domain.CustomClaims, error)
	ValidateRefreshToken(tokenString string) (uuid.UUID, error) // Returns Session ID
	GetPublicKey() *rsa.PublicKey
}

type JWTTokenService struct {
	privateKey    *rsa.PrivateKey
	publicKey     *rsa.PublicKey
	accessTTL     time.Duration
	refreshTTL    time.Duration
	issuer        string
}

func NewJWTTokenService(privKey *rsa.PrivateKey, accessTTL, refreshTTL time.Duration, issuer string) *JWTTokenService {
	return &JWTTokenService{
		privateKey: privKey,
		publicKey:  &privKey.PublicKey,
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
		issuer:     issuer,
	}
}

// GenerateRSAKeyPair is a helper to generate a key pair on startup if not provided via env
func GenerateRSAKeyPair() (*rsa.PrivateKey, error) {
	return rsa.GenerateKey(rand.Reader, 2048)
}

func (s *JWTTokenService) GetPublicKey() *rsa.PublicKey {
	return s.publicKey
}

func (s *JWTTokenService) GenerateTokenPair(user *domain.User, sessionID uuid.UUID) (*domain.TokenPair, error) {
	now := time.Now()

	// 1. Generate Access Token (JWT)
	claims := domain.CustomClaims{
		Email:     user.Email,
		Role:      string(user.Role),
		SessionID: sessionID.String(),
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID.String(),
			Issuer:    s.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodRS256, &claims)
	accessTokenString, err := accessToken.SignedString(s.privateKey)
	if err != nil {
		return nil, err
	}

	// 2. Generate Refresh Token (Opaque UUID is safer than JWT for refresh tokens, but we can use JWT too)
	// We'll use a random UUID as the refresh token. It gets hashed before storing in Redis.
	refreshToken := uuid.New().String()

	return &domain.TokenPair{
		AccessToken:  accessTokenString,
		RefreshToken: refreshToken,
		ExpiresIn:    int(s.accessTTL.Seconds()),
	}, nil
}

func (s *JWTTokenService) ValidateAccessToken(tokenString string) (*domain.CustomClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &domain.CustomClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return s.publicKey, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*domain.CustomClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, jwt.ErrTokenInvalidClaims
}

func (s *JWTTokenService) ValidateRefreshToken(tokenString string) (uuid.UUID, error) {
	// Not implemented in JWTTokenService yet
	return uuid.Nil, nil
}
