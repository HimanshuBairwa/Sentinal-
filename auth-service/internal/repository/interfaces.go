package repository

import (
	"context"
	"sentinel/auth-service/internal/domain"

	"github.com/google/uuid"
)

type UserRepository interface {
	Create(ctx context.Context, user *domain.User) error
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
	IncrementFailedLogin(ctx context.Context, email string, maxAttempts int, lockDurationMinutes int) error
	ResetFailedLogin(ctx context.Context, id uuid.UUID) error
	UpdateLastLogin(ctx context.Context, id uuid.UUID) error
}

type SessionRepository interface {
	Create(ctx context.Context, session *domain.Session) error
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Session, error)
	RevokeFamily(ctx context.Context, tokenFamily uuid.UUID) error
	UpdateLastUsed(ctx context.Context, id uuid.UUID) error
}
