package service

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"errors"
	"strings"
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
	audience      string
	keyID         string
}

func NewJWTTokenService(privKey *rsa.PrivateKey, accessTTL, refreshTTL time.Duration, issuer, audience, keyID string) *JWTTokenService {
	return &JWTTokenService{
		privateKey: privKey,
		publicKey:  &privKey.PublicKey,
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
		issuer:     issuer,
		audience:   audience,
		keyID:      keyID,
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
			Audience:  jwt.ClaimStrings{s.audience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTTL)),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodRS256, &claims)
	accessToken.Header["kid"] = s.keyID
	accessTokenString, err := accessToken.SignedString(s.privateKey)
	if err != nil {
		return nil, err
	}

	// 2. Generate Refresh Token (Opaque UUID is safer than JWT for refresh tokens, but we can use JWT too)
	// We'll use a random UUID as the refresh token. It gets hashed before storing in Redis.
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	refreshToken := sessionID.String() + "." + base64.RawURLEncoding.EncodeToString(secret)

	return &domain.TokenPair{
		AccessToken:  accessTokenString,
		RefreshToken: refreshToken,
		ExpiresIn:    int(s.accessTTL.Seconds()),
	}, nil
}

func (s *JWTTokenService) ValidateAccessToken(tokenString string) (*domain.CustomClaims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&domain.CustomClaims{},
		func(token *jwt.Token) (interface{}, error) { return s.publicKey, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithIssuer(s.issuer),
		jwt.WithAudience(s.audience),
		jwt.WithExpirationRequired(),
	)

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*domain.CustomClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, jwt.ErrTokenInvalidClaims
}

func (s *JWTTokenService) ValidateRefreshToken(tokenString string) (uuid.UUID, error) {
	parts := strings.Split(tokenString, ".")
	if len(parts) != 2 {
		return uuid.Nil, errors.New("invalid refresh token format")
	}
	sessionID, err := uuid.Parse(parts[0])
	if err != nil {
		return uuid.Nil, errors.New("invalid refresh token session")
	}
	secret, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(secret) != 32 {
		return uuid.Nil, errors.New("invalid refresh token secret")
	}
	return sessionID, nil
}
