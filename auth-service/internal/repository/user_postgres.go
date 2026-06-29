package repository

import (
	"context"
	"errors"
	"time"

	"sentinel/auth-service/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserPostgres struct {
	db *pgxpool.Pool
}

func NewUserPostgres(db *pgxpool.Pool) *UserPostgres {
	return &UserPostgres{db: db}
}

func (r *UserPostgres) Create(ctx context.Context, user *domain.User) error {
	query := `
		INSERT INTO users (id, email, password_hash, full_name, role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at, updated_at
	`
	err := r.db.QueryRow(ctx, query,
		user.ID,
		user.Email,
		user.PasswordHash,
		user.FullName,
		user.Role,
	).Scan(&user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return err
	}
	return nil
}

func (r *UserPostgres) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	query := `
		SELECT id, email, password_hash, full_name, role, is_active, email_verified, 
		       created_at, updated_at, last_login_at, failed_login_attempts, locked_until
		FROM users WHERE email = $1
	`
	
	var u domain.User
	err := r.db.QueryRow(ctx, query, email).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.FullName, &u.Role, &u.IsActive, &u.EmailVerified,
		&u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt, &u.FailedLoginCount, &u.LockedUntil,
	)
	
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &u, nil
}

func (r *UserPostgres) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	query := `
		SELECT id, email, password_hash, full_name, role, is_active, email_verified, 
		       created_at, updated_at, last_login_at, failed_login_attempts, locked_until
		FROM users WHERE id = $1
	`
	
	var u domain.User
	err := r.db.QueryRow(ctx, query, id).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.FullName, &u.Role, &u.IsActive, &u.EmailVerified,
		&u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt, &u.FailedLoginCount, &u.LockedUntil,
	)
	
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}
	return &u, nil
}

func (r *UserPostgres) IncrementFailedLogin(ctx context.Context, email string, maxAttempts int, lockDurationMinutes int) error {
	query := `
		UPDATE users 
		SET failed_login_attempts = failed_login_attempts + 1,
		    locked_until = CASE 
		        WHEN failed_login_attempts + 1 >= $1 THEN NOW() + $2 * INTERVAL '1 minute'
		        ELSE locked_until 
		    END
		WHERE email = $3
	`
	_, err := r.db.Exec(ctx, query, maxAttempts, lockDurationMinutes, email)
	return err
}

func (r *UserPostgres) ResetFailedLogin(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE users 
		SET failed_login_attempts = 0, locked_until = NULL
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id)
	return err
}

func (r *UserPostgres) UpdateLastLogin(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE users 
		SET last_login_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id)
	return err
}
