package repository

import (
	"context"
	"fmt"
	"sentinel/analytics-service/internal/models"
)

func (r *clickHouseRepoImpl) GetOverview(ctx context.Context) (map[string]interface{}, error) {
	var totalEvents uint64
	var fraudEvents uint64

	query := `
		SELECT 
			count() as total_events,
			countIf(risk_score >= 60) as fraud_events
		FROM events
		WHERE timestamp >= now() - INTERVAL 24 HOUR
	`
	err := r.conn.QueryRow(ctx, query).Scan(&totalEvents, &fraudEvents)
	if err != nil {
		return nil, fmt.Errorf("failed to get overview: %w", err)
	}

	fraudRate := float64(0)
	if totalEvents > 0 {
		fraudRate = (float64(fraudEvents) / float64(totalEvents)) * 100
	}

	return map[string]interface{}{
		"total_events": totalEvents,
		"fraud_events": fraudEvents,
		"fraud_rate":   fraudRate,
	}, nil
}

func (r *clickHouseRepoImpl) GetFraudRate(ctx context.Context) ([]map[string]interface{}, error) {
	query := `
		SELECT 
			toStartOfHour(timestamp) as time_bucket,
			count() as total,
			countIf(risk_score >= 60) as fraud
		FROM events
		WHERE timestamp >= now() - INTERVAL 24 HOUR
		GROUP BY time_bucket
		ORDER BY time_bucket
	`
	rows, err := r.conn.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var bucket interface{} // time.Time from ClickHouse
		var total uint64
		var fraud uint64
		if err := rows.Scan(&bucket, &total, &fraud); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"time_bucket": bucket,
			"total":       total,
			"fraud":       fraud,
		})
	}
	return results, nil
}

func (r *clickHouseRepoImpl) GetTopThreats(ctx context.Context) ([]map[string]interface{}, error) {
	query := `
		SELECT 
			ip_address as threat_source,
			count() as attempt_count
		FROM events
		WHERE risk_score >= 60
		GROUP BY ip_address
		ORDER BY attempt_count DESC
		LIMIT 10
	`
	rows, err := r.conn.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var ip string
		var count uint64
		if err := rows.Scan(&ip, &count); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"threat_source": ip,
			"attempt_count": count,
		})
	}
	return results, nil
}

func (r *clickHouseRepoImpl) GetLatency(ctx context.Context) (map[string]interface{}, error) {
	query := `
		SELECT 
			quantiles(0.50, 0.90, 0.99)(toFloat64(JSONExtractFloat(payload, 'latency')))
		FROM events
		WHERE timestamp >= now() - INTERVAL 24 HOUR
	`
	var quantiles []float64
	err := r.conn.QueryRow(ctx, query).Scan(&quantiles)
	if err != nil {
		return nil, err
	}

	if len(quantiles) != 3 {
		return map[string]interface{}{"p50": 0, "p90": 0, "p99": 0}, nil
	}
	return map[string]interface{}{
		"p50": quantiles[0],
		"p90": quantiles[1],
		"p99": quantiles[2],
	}, nil
}

func (r *clickHouseRepoImpl) GetEvents(ctx context.Context, limit, offset int) ([]*models.Event, error) {
	query := `
		SELECT id, event_id, session_id, user_id, event_type, producer, payload,
		       ip_address, user_agent, request_id, action, risk_score, timestamp
		FROM events
		ORDER BY timestamp DESC
		LIMIT ? OFFSET ?
	`
	rows, err := r.conn.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*models.Event
	for rows.Next() {
		var e models.Event
		if err := rows.Scan(&e.ID, &e.EventID, &e.SessionID, &e.UserID, &e.EventType, &e.Producer, &e.Payload, &e.IPAddress, &e.UserAgent, &e.RequestID, &e.Action, &e.RiskScore, &e.Timestamp); err != nil {
			return nil, err
		}
		events = append(events, &e)
	}
	return events, nil
}

func (r *clickHouseRepoImpl) GetGeo(ctx context.Context) ([]map[string]interface{}, error) {
	query := `
		SELECT 
			JSONExtractString(payload, 'country') as country,
			count() as count
		FROM events
		WHERE JSONExtractString(payload, 'country') != ''
		GROUP BY country
		ORDER BY count DESC
		LIMIT 20
	`
	rows, err := r.conn.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var country string
		var count uint64
		if err := rows.Scan(&country, &count); err != nil {
			return nil, err
		}
		results = append(results, map[string]interface{}{
			"country": country,
			"count":   count,
		})
	}
	return results, nil
}
