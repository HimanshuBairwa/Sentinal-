package domain

import (
	"time"

	"github.com/google/uuid"
)

type Session struct {
	ID               uuid.UUID      `json:"id"`
	UserID           uuid.UUID      `json:"user_id"`
	RefreshTokenHash string         `json:"-"`
	TokenFamily      uuid.UUID      `json:"token_family"`
	DeviceInfo       map[string]any `json:"device_info"`
	IPAddress        string         `json:"ip_address"`
	UserAgent        string         `json:"user_agent"`
	IsRevoked        bool           `json:"is_revoked"`
	ExpiresAt        time.Time      `json:"expires_at"`
	CreatedAt        time.Time      `json:"created_at"`
	LastUsedAt       time.Time      `json:"last_used_at"`
}
