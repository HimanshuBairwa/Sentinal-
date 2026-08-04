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
	GetOverview(ctx context.Context) (map[string]interface{}, error)
	GetFraudRate(ctx context.Context) ([]map[string]interface{}, error)
	GetTopThreats(ctx context.Context) ([]map[string]interface{}, error)
	GetLatency(ctx context.Context) (map[string]interface{}, error)
	GetEvents(ctx context.Context, limit, offset int) ([]*models.Event, error)
	GetGeo(ctx context.Context) ([]map[string]interface{}, error)
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
		id String,
		event_id String,
		session_id String,
		user_id String,
		event_type LowCardinality(String),
		producer LowCardinality(String),
		payload String,
		ip_address String,
		user_agent String,
		request_id String,
		action LowCardinality(String),
		risk_score Float32,
		timestamp DateTime('UTC')
	) ENGINE = MergeTree()
	PARTITION BY toYYYYMM(timestamp)
	ORDER BY (timestamp, event_type, user_id)
	TTL timestamp + INTERVAL 90 DAY
	`
	if err := conn.Exec(context.Background(), query); err != nil {
		return nil, fmt.Errorf("failed to create table: %w", err)
	}

	return &clickHouseRepoImpl{
		conn: conn,
	}, nil
}

func (r *clickHouseRepoImpl) InsertBatch(ctx context.Context, events []*models.Event) error {
	batch, err := r.conn.PrepareBatch(ctx, `INSERT INTO events
		(id, event_id, session_id, user_id, event_type, producer, payload,
		 ip_address, user_agent, request_id, action, risk_score, timestamp)`)
	if err != nil {
		return fmt.Errorf("failed to prepare batch: %w", err)
	}

	for _, e := range events {
		err := batch.Append(
			e.ID,
			e.EventID,
			e.SessionID,
			e.UserID,
			e.EventType,
			e.Producer,
			e.Payload,
			e.IPAddress,
			e.UserAgent,
			e.RequestID,
			e.Action,
			e.RiskScore,
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
