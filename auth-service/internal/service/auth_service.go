package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"sentinel/auth-service/internal/domain"
	"sentinel/auth-service/internal/kafka"
	"sentinel/auth-service/internal/repository"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo     repository.UserRepository
	sessionRepo  repository.SessionRepository
	tokenService TokenService
	kafkaProd    *kafka.Producer
	refreshTTL   time.Duration
}

func NewAuthService(ur repository.UserRepository, sr repository.SessionRepository, ts TokenService, kp *kafka.Producer, refreshTTL time.Duration) *AuthService {
	return &AuthService{
		userRepo:     ur,
		sessionRepo:  sr,
		tokenService: ts,
		kafkaProd:    kp,
		refreshTTL:   refreshTTL,
	}
}

func (s *AuthService) RegisterUser(ctx context.Context, email, password, fullName string, ipAddress string) (*domain.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if !strings.Contains(email, "@") || len(email) > 255 {
		return nil, domain.ErrInvalidEmail
	}
	if err := domain.ValidatePassword(password); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12) // Cost 12 is strong
	if err != nil {
		return nil, err
	}

	// Bootstrap: the FIRST registered user becomes admin so the platform's
	// RBAC (rules management, admin stats) is usable without manual SQL.
	// Every later user is a standard 'user'.
	count, err := s.userRepo.Count(ctx)
	if err != nil {
		// Fail-closed on uncertainty: never grant admin if we can't verify.
		return nil, err
	}
	role := domain.RoleUser
	if count == 0 {
		role = domain.RoleAdmin
	}

	user := &domain.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: string(hash),
		FullName:     fullName,
		Role:         role,
		IsActive:     true,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	// Publish Event
	if err := s.kafkaProd.PublishEvent(ctx, kafka.AuthEvent{
		EventID:   uuid.New().String(),
		EventType: kafka.EventUserRegistered,
		Timestamp: time.Now(),
		UserID:    user.ID.String(),
		Email:     user.Email,
		IPAddress: ipAddress,
	}); err != nil {
		logrus.Errorf("failed to publish EventUserRegistered to Kafka: %v", err)
	}

	return user, nil
}

func (s *AuthService) Login(ctx context.Context, email, password string, ipAddress, userAgent string, deviceInfo map[string]any) (*domain.TokenPair, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		// Prevent user enumeration by taking the same time to fail
		bcrypt.CompareHashAndPassword([]byte("dummy_hash_to_prevent_timing_attacks__"), []byte(password))
		return nil, domain.ErrInvalidPassword
	}

	if user.IsLocked() {
		return nil, domain.ErrAccountLocked
	}
	if !user.IsActive {
		return nil, domain.ErrAccountInactive
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
	if err != nil {
		// Increment failed logins (Max 5 attempts, lockout 15 mins)
		s.userRepo.IncrementFailedLogin(ctx, email, 5, 15)
		
		if err := s.kafkaProd.PublishEvent(ctx, kafka.AuthEvent{
			EventID:   uuid.New().String(),
			EventType: kafka.EventLoginFailed,
			Timestamp: time.Now(),
			UserID:    user.ID.String(),
			Email:     user.Email,
			IPAddress: ipAddress,
		}); err != nil {
			logrus.Errorf("failed to publish EventLoginFailed to Kafka: %v", err)
		}
		return nil, domain.ErrInvalidPassword
	}

	// Success! Reset failed logins
	if user.FailedLoginCount > 0 {
		if err := s.userRepo.ResetFailedLogin(ctx, user.ID); err != nil {
			logrus.Errorf("failed to reset failed login count for user %s: %v", user.ID, err)
		}
	}
	if err := s.userRepo.UpdateLastLogin(ctx, user.ID); err != nil {
		logrus.Errorf("failed to update last login for user %s: %v", user.ID, err)
	}

	// Create Session
	sessionID := uuid.New()
	tokenFamily := uuid.New()
	tokenPair, err := s.tokenService.GenerateTokenPair(user, sessionID)
	if err != nil {
		return nil, err
	}

	// Hash refresh token before storing it
	hash := sha256.Sum256([]byte(tokenPair.RefreshToken))
	rtHash := hex.EncodeToString(hash[:])

	session := &domain.Session{
		ID:               sessionID,
		UserID:           user.ID,
		RefreshTokenHash: rtHash,
		TokenFamily:      tokenFamily,
		DeviceInfo:       deviceInfo,
		IPAddress:        ipAddress,
		UserAgent:        userAgent,
		IsRevoked:        false,
		ExpiresAt:        time.Now().Add(s.refreshTTL),
		CreatedAt:        time.Now(),
		LastUsedAt:       time.Now(),
	}

	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return nil, err
	}

	if err := s.kafkaProd.PublishEvent(ctx, kafka.AuthEvent{
		EventID:   uuid.New().String(),
		EventType: kafka.EventUserLoggedIn,
		Timestamp: time.Now(),
		UserID:    user.ID.String(),
		Email:     user.Email,
		IPAddress: ipAddress,
	}); err != nil {
		logrus.Errorf("failed to publish EventUserLoggedIn to Kafka: %v", err)
	}

	return tokenPair, nil
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*domain.TokenPair, error) {
	sessionID, err := s.tokenService.ValidateRefreshToken(refreshToken)
	if err != nil {
		return nil, domain.ErrInvalidRefresh
	}
	session, err := s.sessionRepo.GetByID(ctx, sessionID)
	if err != nil || session.IsRevoked || session.ExpiresAt.Before(time.Now()) {
		return nil, domain.ErrInvalidRefresh
	}
	hash := sha256.Sum256([]byte(refreshToken))
	if !hmac.Equal([]byte(hex.EncodeToString(hash[:])), []byte(session.RefreshTokenHash)) {
		_ = s.sessionRepo.RevokeFamily(ctx, session.TokenFamily)
		return nil, domain.ErrRefreshReuse
	}
	user, err := s.userRepo.GetByID(ctx, session.UserID)
	if err != nil || !user.IsActive {
		return nil, domain.ErrInvalidRefresh
	}
	newPair, err := s.tokenService.GenerateTokenPair(user, session.ID)
	if err != nil {
		return nil, err
	}
	newHash := sha256.Sum256([]byte(newPair.RefreshToken))
	session.RefreshTokenHash = hex.EncodeToString(newHash[:])
	session.LastUsedAt = time.Now().UTC()
	if err := s.sessionRepo.Create(ctx, session); err != nil {
		return nil, err
	}
	return newPair, nil
}

func (s *AuthService) Logout(ctx context.Context, sessionID uuid.UUID) error {
	return s.sessionRepo.RevokeByID(ctx, sessionID)
}
