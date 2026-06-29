package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
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
}

func NewAuthService(ur repository.UserRepository, sr repository.SessionRepository, ts TokenService, kp *kafka.Producer) *AuthService {
	return &AuthService{
		userRepo:     ur,
		sessionRepo:  sr,
		tokenService: ts,
		kafkaProd:    kp,
	}
}

func (s *AuthService) RegisterUser(ctx context.Context, email, password, fullName string, ipAddress string) (*domain.User, error) {
	if err := domain.ValidatePassword(password); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12) // Cost 12 is strong
	if err != nil {
		return nil, err
	}

	user := &domain.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: string(hash),
		FullName:     fullName,
		Role:         domain.RoleUser,
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
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		// Prevent user enumeration by taking the same time to fail
		bcrypt.CompareHashAndPassword([]byte("dummy_hash_to_prevent_timing_attacks__"), []byte(password))
		return nil, domain.ErrInvalidPassword
	}

	if user.IsLocked() {
		return nil, domain.ErrAccountLocked
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
		ExpiresAt:        time.Now().Add(7 * 24 * time.Hour), // 7 days refresh TTL
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
