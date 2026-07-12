package models

import "time"

// Event represents a generic analytics event from the Sentinel Fraud Platform.
type Event struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	UserID    string    `json:"user_id"`
	EventType string    `json:"event_type"`
	Payload   string    `json:"payload"`
	IPAddress string    `json:"ip_address"`
	UserAgent string    `json:"user_agent"`
	Timestamp time.Time `json:"timestamp"`
}
