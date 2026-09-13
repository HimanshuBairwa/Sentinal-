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
	"sync"
	"sync/atomic"
	"time"

	"sentinel/gateway/internal/metrics"

	"github.com/golang-jwt/jwt/v5"
)

type AuthMiddleware struct {
	publicKey atomic.Pointer[rsa.PublicKey] // hot-swappable; refreshed in background
	issuer    string
	audience  string
}

// FetchPublicKey retries fetching the public key from the auth service until successful.
func FetchPublicKey(authServiceURL string) (*rsa.PublicKey, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	url := fmt.Sprintf("%s/api/v1/auth/public-key", authServiceURL)

	for i := 0; i < 30; i++ {
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == http.StatusOK {
			pemBytes, err := readAllAndClose(resp)
			if err != nil {
				return nil, err
			}
			return ParsePEMPublicKey(pemBytes)
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(2 * time.Second)
	}
	return nil, errors.New("timeout waiting for auth service public key")
}

func readAllAndClose(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// ParsePEMPublicKey parses a PEM-encoded RS256 public key.
func ParsePEMPublicKey(pemBytes []byte) (*rsa.PublicKey, error) {
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

func NewAuthMiddleware(pubKey *rsa.PublicKey, issuer, audience string) *AuthMiddleware {
	m := &AuthMiddleware{issuer: issuer, audience: audience}
	m.publicKey.Store(pubKey)
	return m
}

// RefreshKey atomically swaps the verification key (zero downtime rotation).
func (m *AuthMiddleware) RefreshKey(pubKey *rsa.PublicKey) {
	if pubKey != nil {
		m.publicKey.Store(pubKey)
	}
}

// KeyPoller periodically re-fetches the public key so an auth-service restart
// (or key rotation) never causes a permanent gateway outage.
type KeyPoller struct {
	mu         sync.Mutex
	current    *rsa.PublicKey
	fetchURL   string
	middleware *AuthMiddleware
	stop       chan struct{}
	stopped    chan struct{}
	lastErr    atomic.Value // string
}

func NewKeyPoller(authServiceURL string, mw *AuthMiddleware) *KeyPoller {
	return &KeyPoller{
		fetchURL:   authServiceURL + "/api/v1/auth/public-key",
		middleware: mw,
		stop:       make(chan struct{}),
		stopped:    make(chan struct{}),
	}
}

func (p *KeyPoller) Start(interval time.Duration) {
	go func() {
		defer close(p.stopped)
		client := &http.Client{Timeout: 5 * time.Second}
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			p.mu.Lock()
			url := p.fetchURL
			mw := p.middleware
			p.mu.Unlock()

			resp, err := client.Get(url)
			switch {
			case err != nil:
				atomic.StoreString(p.lastErr, err.Error())
			case resp.StatusCode != http.StatusOK:
				atomic.StoreString(p.lastErr, fmt.Sprintf("status %d", resp.StatusCode))
				resp.Body.Close()
			default:
				pemBytes, readErr := readAllAndClose(resp)
				if readErr != nil {
					atomic.StoreString(p.lastErr, readErr.Error())
				} else if pub, parseErr := ParsePEMPublicKey(pemBytes); parseErr != nil {
					atomic.StoreString(p.lastErr, parseErr.Error())
				} else {
					p.mu.Lock()
					sameKey := p.current != nil && pub.Equal(p.current)
					p.current = pub
					p.mu.Unlock()
					if !sameKey {
						mw.RefreshKey(pub) // atomic swap; no dropped requests
					}
					atomic.StoreString(p.lastErr, "")
				}
			}

			select {
			case <-p.stop:
				return
			case <-ticker.C:
			}
		}
	}()
}

// Status reports the last fetch error (empty = healthy), used by /health.
func (p *KeyPoller) Status() string {
	if v, ok := p.lastErr.Load().(string); ok {
		return v
	}
	return ""
}

func (p *KeyPoller) Stop() {
	close(p.stop)
	<-p.stopped
}

func (m *AuthMiddleware) VerifyJWT(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" && isWebSocketUpgrade(r) {
			if accessToken := r.URL.Query().Get("access_token"); accessToken != "" {
				authHeader = "Bearer " + accessToken
			}
		}
		if authHeader == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.Fields(authHeader)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "invalid authorization header format", http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		pubKey := m.publicKey.Load()
		if pubKey == nil {
			http.Error(w, "auth key unavailable", http.StatusServiceUnavailable)
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return pubKey, nil
		}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}), jwt.WithIssuer(m.issuer), jwt.WithAudience(m.audience), jwt.WithExpirationRequired())

		if err != nil || !token.Valid {
			metrics.ObserveUnauthorized()
			http.Error(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}

		// Prevent header contamination
		r.Header.Del("X-User-ID")
		r.Header.Del("X-User-Role")
		r.Header.Del("X-User-Email")

		// Forward verified claims as trusted headers to downstream services
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

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Connection"), "Upgrade") && strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
}
