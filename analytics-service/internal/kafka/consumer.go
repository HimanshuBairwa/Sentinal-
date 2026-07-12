package kafka

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
	"sentinel/analytics-service/internal/batch"
	"sentinel/analytics-service/internal/models"
)

type Consumer struct {
	reader *kafka.Reader
	engine *batch.Engine
	wg     sync.WaitGroup
	ctx    context.Context
	cancel context.CancelFunc
}

func NewConsumer(brokers []string, topic, groupID string, engine *batch.Engine) *Consumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		GroupID:        groupID,
		Topic:          topic,
		MinBytes:       10e3, // 10KB
		MaxBytes:       10e6, // 10MB
		CommitInterval: time.Second,
		StartOffset:    kafka.LastOffset,
	})

	ctx, cancel := context.WithCancel(context.Background())

	return &Consumer{
		reader: reader,
		engine: engine,
		ctx:    ctx,
		cancel: cancel,
	}
}

func (c *Consumer) Start() {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		for {
			select {
			case <-c.ctx.Done():
				return
			default:
				msg, err := c.reader.ReadMessage(c.ctx)
				if err != nil {
					if c.ctx.Err() != nil {
						return // context cancelled
					}
					log.Printf("Failed to read message from kafka: %v", err)
					continue
				}

				var event models.Event
				if err := json.Unmarshal(msg.Value, &event); err != nil {
					log.Printf("Failed to unmarshal event: %v", err)
					continue
				}

				c.engine.AddEvent(&event)
			}
		}
	}()
}

func (c *Consumer) Stop() {
	c.cancel()
	c.wg.Wait()
	if err := c.reader.Close(); err != nil {
		log.Printf("Failed to close kafka reader: %v", err)
	}
}
