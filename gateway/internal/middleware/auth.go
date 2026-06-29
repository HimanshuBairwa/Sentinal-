package middleware

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type AuthMiddleware struct {
	publicKey *rsa.PublicKey
}

// FetchPublicKey continuously tries to fetch the public key from the auth service until successful
func FetchPublicKey(authServiceURL string) (*rsa.PublicKey, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	url := fmt.Sprintf("%s/api/v1/auth/public-key", authServiceURL)

	for i := 0; i < 10; i++ {
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == http.StatusOK {
			pemBytes, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil {
				return nil, err
			}

			block, _ := pem.Decode(pemBytes)
			if block == nil {
				return nil, errors.New("failed to decode PEM block")
			}

			pub, err := x509.ParsePKIXPublicKey(block.Bytes)
			if err != nil {
				return nil, err
			}

			rsaPub, ok := pub.(*rsa.PublicKey)
			if !ok {
				return nil, errors.New("not an RSA public key")
			}

			return rsaPub, nil
		}
		
		if resp != nil {
			resp.Body.Close()
		}
		
		time.Sleep(2 * time.Second)
	}

	return nil, errors.New("timeout waiting for auth service public key")
}

func NewAuthMiddleware(pubKey *rsa.PublicKey) *AuthMiddleware {
	return &AuthMiddleware{publicKey: pubKey}
}

func (m *AuthMiddleware) VerifyJWT(next http.Handler) http.Handler {
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

		tokenString := parts[1]
		
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return m.publicKey, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Prevent Header Contamination
		r.Header.Del("X-User-ID")
		r.Header.Del("X-User-Role")
		r.Header.Del("X-User-Email")

		// Token is valid, forward the claims as headers to downstream microservices!
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if sub, ok := claims["sub"]; ok {
				r.Header.Set("X-User-ID", fmt.Sprintf("%v", sub))
			}
			if role, ok := claims["role"].(string); ok {
				r.Header.Set("X-User-Role", role)
			}
			if email, ok := claims["email"].(string); ok {
				r.Header.Set("X-User-Email", email)
			}
		}

		next.ServeHTTP(w, r)
	})
}
