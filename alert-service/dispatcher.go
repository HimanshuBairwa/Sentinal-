package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net"
	"net/url"
	"strings"
	"time"
)

type WebhookDispatcher struct {
	dlqProducer *KafkaProducer
	httpClient  *http.Client
	allowlist   map[string]struct{}
	production  bool
}

func NewWebhookDispatcher(dlqProducer *KafkaProducer, allowlist string, environment string) *WebhookDispatcher {
	domains := make(map[string]struct{})
	for _, value := range strings.Split(allowlist, ",") {
		if value = strings.ToLower(strings.TrimSpace(value)); value != "" {
			domains[value] = struct{}{}
		}
	}
	return &WebhookDispatcher{
		dlqProducer: dlqProducer,
	httpClient: &http.Client{
			Timeout: 10 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return fmt.Errorf("webhook redirects are not allowed")
			},
		},
		allowlist: domains,
		production: strings.EqualFold(environment, "production"),
	}
}

func (d *WebhookDispatcher) Dispatch(ctx context.Context, alert AlertEvent) error {
	if err := d.validateWebhook(alert.Webhook); err != nil {
		d.sendToDLQ(alert, "invalid_webhook")
		return err
	}
	payloadBytes, err := json.Marshal(alert)
	if err != nil {
		log.Printf("Failed to marshal alert for webhook: %v", err)
		d.sendToDLQ(alert, "marshal_error")
		return err
	}

	maxRetries := 5
	backoff := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		req, err := http.NewRequestWithContext(ctx, "POST", alert.Webhook, bytes.NewBuffer(payloadBytes))
		if err != nil {
			log.Printf("Failed to create webhook request: %v", err)
			d.sendToDLQ(alert, "request_creation_failed")
			return err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := d.httpClient.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				// Success
				log.Printf("Successfully dispatched alert %s", alert.AlertID)
				return nil
			}
			log.Printf("Webhook returned status %d for alert %s", resp.StatusCode, alert.AlertID)
		} else {
			log.Printf("Webhook request failed for alert %s: %v", alert.AlertID, err)
		}

		// Exponential backoff
		if i < maxRetries-1 {
			log.Printf("Retrying alert %s in %v", alert.AlertID, backoff)
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return ctx.Err()
			}
			backoff *= 2
		}
	}

	// Max retries reached, send to DLQ
	log.Printf("Max retries reached for alert %s, sending to DLQ", alert.AlertID)
	d.sendToDLQ(alert, "max_retries_exceeded")
	return fmt.Errorf("webhook delivery failed after retries")
}

func (d *WebhookDispatcher) validateWebhook(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Hostname() == "" {
		return fmt.Errorf("invalid webhook URL")
	}
	if d.production && !strings.EqualFold(u.Scheme, "https") {
		return fmt.Errorf("production webhooks must use HTTPS")
	}
	if len(d.allowlist) > 0 {
		if _, ok := d.allowlist[strings.ToLower(u.Hostname())]; !ok {
			return fmt.Errorf("webhook host is not allowlisted")
		}
	}
	for _, ip := range resolveIPs(u.Hostname()) {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
			return fmt.Errorf("webhook resolves to a private address")
		}
	}
	return nil
}

func resolveIPs(host string) []net.IP {
	addresses, err := net.LookupIP(host)
	if err != nil {
		return []net.IP{net.ParseIP("127.0.0.1")}
	}
	return addresses
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
