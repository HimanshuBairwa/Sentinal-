package models

import (
	"time"

	"github.com/google/uuid"
)

// Event represents a generic analytics event from the Sentinel Fraud Platform.
type Event struct {
	ID            string    `json:"id"`
	EventID       string    `json:"event_id,omitempty"`
	DecisionID    string    `json:"decision_id,omitempty"`
	SchemaVersion int       `json:"schema_version,omitempty"`
	Producer      string    `json:"producer,omitempty"`
	SessionID     string    `json:"session_id"`
	UserID        string    `json:"user_id"`
	EventType     string    `json:"event_type"`
	Payload       string    `json:"payload,omitempty"`
	IPAddress     string    `json:"ip_address"`
	UserAgent     string    `json:"user_agent"`
	Timestamp     time.Time `json:"timestamp"`
	OccurredAt    time.Time `json:"occurred_at,omitempty"`
	RequestID     string    `json:"request_id,omitempty"`
	Action        string    `json:"action,omitempty"`
	RiskScore     float64   `json:"risk_score,omitempty"`
	FinalScore    float64   `json:"final_score,omitempty"`
	// Geo extracted from payload at read time (GetEvents) so the dashboard
	// threat map receives typed fields instead of a raw JSON string blob.
	Country     string  `json:"country,omitempty"`
	CountryCode string  `json:"country_code,omitempty"`
	Lat         float64 `json:"lat,omitempty"`
	Lon         float64 `json:"lon,omitempty"`
}

func (e *Event) Normalize() {
	if e.ID == "" {
		e.ID = e.EventID
	}
	if e.ID == "" {
		e.ID = uuid.NewString()
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = e.OccurredAt
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now().UTC()
	}
	if e.EventID == "" {
		e.EventID = e.ID
	}
}
