package domain

import (
	"errors"
	"regexp"
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleUser    Role = "user"
	RoleAdmin   Role = "admin"
	RoleService Role = "service"
)

type User struct {
	ID               uuid.UUID `json:"id"`
	Email            string    `json:"email"`
	PasswordHash     string    `json:"-"`
	FullName         string    `json:"full_name"`
	Role             Role      `json:"role"`
	IsActive         bool      `json:"is_active"`
	EmailVerified    bool      `json:"email_verified"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
	LastLoginAt      *time.Time `json:"last_login_at,omitempty"`
	FailedLoginCount int       `json:"-"`
	LockedUntil      *time.Time `json:"locked_until,omitempty"`
}

var (
	ErrInvalidEmail    = errors.New("invalid email format")
	ErrWeakPassword    = errors.New("password must be at least 12 characters, with 1 uppercase, 1 lowercase, 1 digit, and 1 special character")
	ErrAccountLocked   = errors.New("account is locked due to multiple failed login attempts")
	ErrInvalidPassword = errors.New("invalid email or password")
)

// ValidatePassword enforces strict password requirements
func ValidatePassword(password string) error {
	if len(password) < 12 {
		return ErrWeakPassword
	}
	hasUpper := regexp.MustCompile(`[A-Z]`).MatchString(password)
	hasLower := regexp.MustCompile(`[a-z]`).MatchString(password)
	hasDigit := regexp.MustCompile(`[0-9]`).MatchString(password)
	hasSpecial := regexp.MustCompile(`[^a-zA-Z0-9]`).MatchString(password)

	if !hasUpper || !hasLower || !hasDigit || !hasSpecial {
		return ErrWeakPassword
	}
	return nil
}

// IsLocked checks if the user account is currently locked out
func (u *User) IsLocked() bool {
	if u.LockedUntil == nil {
		return false
	}
	return u.LockedUntil.After(time.Now())
}
