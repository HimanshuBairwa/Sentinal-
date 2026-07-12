package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type WebhookDispatcher struct {
	dlqProducer *KafkaProducer
	httpClient  *http.Client
}

func NewWebhookDispatcher(dlqProducer *KafkaProducer) *WebhookDispatcher {
	return &WebhookDispatcher{
		dlqProducer: dlqProducer,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (d *WebhookDispatcher) Dispatch(alert AlertEvent) {
	payloadBytes, err := json.Marshal(alert)
	if err != nil {
		log.Printf("Failed to marshal alert for webhook: %v", err)
		d.sendToDLQ(alert, "marshal_error")
		return
	}

	maxRetries := 5
	backoff := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		req, err := http.NewRequest("POST", alert.Webhook, bytes.NewBuffer(payloadBytes))
		if err != nil {
			log.Printf("Failed to create webhook request: %v", err)
			d.sendToDLQ(alert, "request_creation_failed")
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := d.httpClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				// Success
				log.Printf("Successfully dispatched alert %s", alert.AlertID)
				return
			}
			log.Printf("Webhook returned status %d for alert %s", resp.StatusCode, alert.AlertID)
		} else {
			log.Printf("Webhook request failed for alert %s: %v", alert.AlertID, err)
		}

		// Exponential backoff
		if i < maxRetries-1 {
			log.Printf("Retrying alert %s in %v", alert.AlertID, backoff)
			time.Sleep(backoff)
			backoff *= 2
		}
	}

	// Max retries reached, send to DLQ
	log.Printf("Max retries reached for alert %s, sending to DLQ", alert.AlertID)
	d.sendToDLQ(alert, "max_retries_exceeded")
}

func (d *WebhookDispatcher) sendToDLQ(alert AlertEvent, reason string) {
	dlqMessage := map[string]interface{}{
		"alert":  alert,
		"reason": reason,
		"time":   time.Now().Format(time.RFC3339),
	}
	msgBytes, err := json.Marshal(dlqMessage)
	if err != nil {
		log.Printf("Failed to marshal DLQ message: %v", err)
		return
	}

	if err := d.dlqProducer.Publish(context.Background(), []byte(alert.AlertID), msgBytes); err != nil {
		log.Printf("CRITICAL: Failed to publish to DLQ for alert %s: %v", alert.AlertID, err)
	}
}
