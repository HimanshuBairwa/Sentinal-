package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/segmentio/kafka-go"
)

type AlertEvent struct {
	AlertID string `json:"decision_id"`
	UserID  string `json:"user_id"`
	Payload any `json:"scores"`
	Webhook string `json:"webhook,omitempty"`
	RequestID string `json:"request_id,omitempty"`
	Action string `json:"action,omitempty"`
	Score float64 `json:"final_score,omitempty"`
	Data map[string]any `json:"data,omitempty"`
}

type KafkaConsumer struct {
	reader     *kafka.Reader
	redis      *RedisClient
	dispatcher *WebhookDispatcher
	webhook    string
}

func NewKafkaConsumer(brokers []string, topic, groupID string, redis *RedisClient, dispatcher *WebhookDispatcher, webhook string) *KafkaConsumer {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers: brokers,
		Topic:   topic,
		GroupID: groupID,
	})
	return &KafkaConsumer{
		reader:     r,
		redis:      redis,
		dispatcher: dispatcher,
		webhook: webhook,
	}
}

func (c *KafkaConsumer) Start(ctx context.Context) {
	defer c.reader.Close()
	for {
		m, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return // Context cancelled
			}
			log.Printf("Error fetching message: %v", err)
			continue
		}

		var alert AlertEvent
		if err := json.Unmarshal(m.Value, &alert); err != nil {
			log.Printf("Failed to unmarshal alert: %v", err)
			// Acknowledge bad messages to avoid infinite loop
			c.reader.CommitMessages(ctx, m)
			continue
		}
		if alert.AlertID == "" {
			log.Printf("risk decision has no decision_id; sending to DLQ")
			_ = c.reader.CommitMessages(ctx, m)
			continue
		}
		if alert.Action == "" {
			if value, ok := alert.Data["action"].(string); ok {
				alert.Action = value
			}
		}

		allowed, err := c.redis.AllowAlert(ctx, alert.AlertID, alert.UserID)
		if err != nil {
			log.Printf("Redis error for alert %s: %v", alert.AlertID, err)
			// Do not commit so we retry later if Redis fails (Ensure no data is lost)
			continue
		}

		if allowed {
			alert.Webhook = c.webhook
			if alert.Webhook == "" {
				log.Printf("alert %s has no configured webhook; skipping dispatch", alert.AlertID)
				_ = c.reader.CommitMessages(ctx, m)
				continue
			}
			// Dispatch via Webhook synchronously to guarantee at-least-once processing
			if err := c.dispatcher.Dispatch(ctx, alert); err != nil {
				log.Printf("failed to dispatch alert %s: %v", alert.AlertID, err)
			}
		} else {
			log.Printf("Alert %s blocked (dedup/rate limit)", alert.AlertID)
		}

		// Commit message indicating successful processing or intentional drop/DLQ
		if err := c.reader.CommitMessages(ctx, m); err != nil {
			log.Printf("Failed to commit message: %v", err)
		}
	}
}

type KafkaProducer struct {
	writer *kafka.Writer
}

func NewKafkaProducer(brokers []string, topic string) *KafkaProducer {
	w := &kafka.Writer{
		Addr:                   kafka.TCP(brokers...),
		Topic:                  topic,
		AllowAutoTopicCreation: false,
	}
	return &KafkaProducer{writer: w}
}

func (p *KafkaProducer) Publish(ctx context.Context, key, value []byte) error {
	return p.writer.WriteMessages(ctx, kafka.Message{
		Key:   key,
		Value: value,
	})
}

func (p *KafkaProducer) Close() error {
	return p.writer.Close()
}
