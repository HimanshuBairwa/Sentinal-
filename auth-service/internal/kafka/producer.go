package kafka

import (
	"context"
	"encoding/json"
	"time"

	"github.com/segmentio/kafka-go"
)

type EventType string

const (
	EventUserRegistered EventType = "user_registered"
	EventUserLoggedIn   EventType = "user_logged_in"
	EventLoginFailed    EventType = "login_failed"
	EventAccountLocked  EventType = "account_locked"
)

type AuthEvent struct {
	EventID   string         `json:"event_id"`
	EventType EventType      `json:"event_type"`
	Timestamp time.Time      `json:"timestamp"`
	UserID    string         `json:"user_id,omitempty"`
	Email     string         `json:"email"`
	IPAddress string         `json:"ip_address"`
	Metadata  map[string]any `json:"metadata,omitempty"`
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
