package kafka

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
)

type EventType string

	const (
		EventUserRegistered EventType = "auth.user.registered"
		EventUserLoggedIn   EventType = "auth.user.logged_in"
		EventLoginFailed    EventType = "auth.user.login_failed"
		EventAccountLocked  EventType = "auth.user.account_locked"
)

type AuthEvent struct {
	EventID   string         `json:"event_id"`
	EventType EventType      `json:"event_type"`
	SchemaVersion int         `json:"schema_version"`
	Timestamp time.Time      `json:"timestamp"`
	Producer  string         `json:"producer"`
	UserID    string         `json:"user_id,omitempty"`
	Email     string         `json:"email"`
	IPAddress string         `json:"ip_address"`
	Metadata  map[string]any `json:"metadata,omitempty"`
	OccurredAt time.Time      `json:"occurred_at"`
	Data      map[string]any `json:"data,omitempty"`
	Source    map[string]any `json:"source,omitempty"`
}

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(brokers []string, topic string) *Producer {
	w := &kafka.Writer{
		Addr:                   kafka.TCP(brokers...),
		Topic:                  topic,
		Balancer:               &kafka.Hash{},
		RequiredAcks:           kafka.RequireAll,
		MaxAttempts:            3,
		AllowAutoTopicCreation: false,
	}

	return &Producer{writer: w}
}

func (p *Producer) PublishEvent(ctx context.Context, event AuthEvent) error {
	if event.SchemaVersion == 0 {
		event.SchemaVersion = 1
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = event.Timestamp
	}
	if event.Data == nil {
		event.Data = map[string]any{}
	}
	if event.Source == nil {
		event.Source = map[string]any{"ip_address": event.IPAddress}
	}
	if event.Producer == "" {
		event.Producer = "auth-service"
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	// Use Email as the routing key to ensure events for the same user go to the same partition
	msg := kafka.Message{
		Key:   []byte(event.Email),
		Value: payload,
		Time:  time.Now(),
	}

	return p.writer.WriteMessages(ctx, msg)
}

func (p *Producer) Close() error {
	return p.writer.Close()
}
