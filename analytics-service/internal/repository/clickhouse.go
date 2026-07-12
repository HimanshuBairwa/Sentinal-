package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"sentinel/analytics-service/internal/models"
)

type ClickHouseRepo interface {
	InsertBatch(ctx context.Context, events []*models.Event) error
	Close() error
}

type clickHouseRepoImpl struct {
	conn driver.Conn
}

func NewClickHouseRepo(addr string, database, username, password string) (ClickHouseRepo, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{addr},
		Auth: clickhouse.Auth{
			Database: database,
			Username: username,
			Password: password,
		},
		DialTimeout:     time.Second * 10,
		MaxOpenConns:    20,
		MaxIdleConns:    5,
		ConnMaxLifetime: time.Hour,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open clickhouse connection: %w", err)
	}

	if err := conn.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to ping clickhouse: %w", err)
	}

	// Create table if not exists
	query := `
	CREATE TABLE IF NOT EXISTS events (
		id UUID,
		session_id String,
		user_id String,
		event_type String,
		payload String,
		ip_address String,
		user_agent String,
		timestamp DateTime
	) ENGINE = MergeTree()
	ORDER BY (timestamp, event_type, user_id)
	`
	if err := conn.Exec(context.Background(), query); err != nil {
		return nil, fmt.Errorf("failed to create table: %w", err)
	}

	return &clickHouseRepoImpl{
		conn: conn,
	}, nil
}

func (r *clickHouseRepoImpl) InsertBatch(ctx context.Context, events []*models.Event) error {
	batch, err := r.conn.PrepareBatch(ctx, "INSERT INTO events")
	if err != nil {
		return fmt.Errorf("failed to prepare batch: %w", err)
	}

	for _, e := range events {
		err := batch.Append(
			e.ID,
			e.SessionID,
			e.UserID,
			e.EventType,
			e.Payload,
			e.IPAddress,
			e.UserAgent,
			e.Timestamp,
		)
		if err != nil {
			return fmt.Errorf("failed to append to batch: %w", err)
		}
	}

	if err := batch.Send(); err != nil {
		return fmt.Errorf("failed to send batch: %w", err)
	}

	return nil
}

func (r *clickHouseRepoImpl) Close() error {
	return r.conn.Close()
}
