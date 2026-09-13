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
		CommitInterval: 0,
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
				msg, err := c.reader.FetchMessage(c.ctx)
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
					_ = c.reader.CommitMessages(c.ctx, msg)
					continue
				}
				event.Payload = string(msg.Value)
				if event.EventID == "" {
					event.EventID = event.DecisionID
				}
				if event.RiskScore == 0 {
					event.RiskScore = event.FinalScore
				}
				// Extract typed geo fields from the payload envelope so live
				// WebSocket consumers (dashboard threat map) get country/lat/lon
				// without client-side payload parsing.
				extractGeo(&event)
				event.Normalize()
				persistCtx, cancel := context.WithTimeout(c.ctx, 30*time.Second)
				err = c.engine.AddEvent(persistCtx, &event)
				cancel()
				if err != nil {
					log.Printf("Failed to persist analytics event: %v", err)
					continue
				}
				if err := c.reader.CommitMessages(c.ctx, msg); err != nil {
					log.Printf("Failed to commit analytics event: %v", err)
				}
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

// extractGeo parses country/country_code/lat/lon out of the event payload
// envelope (Kafka risk.decisions / auth.events carry geo in the payload) and
// promotes them to typed fields for the live WebSocket stream.
func extractGeo(e *models.Event) {
	if e.Payload == "" {
		return
	}
	var geo struct {
		Country     string  `json:"country"`
		CountryCode string  `json:"country_code"`
		Lat         float64 `json:"lat"`
		Lon         float64 `json:"lon"`
	}
	if err := json.Unmarshal([]byte(e.Payload), &geo); err != nil {
		return
	}
	e.Country = geo.Country
	e.CountryCode = geo.CountryCode
	if geo.Lat != 0 || geo.Lon != 0 {
		e.Lat = geo.Lat
		e.Lon = geo.Lon
	}
}
