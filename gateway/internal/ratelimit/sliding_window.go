package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type Limiter interface {
	Allow(ctx context.Context, key string) (bool, error)
}

type SlidingWindowLimiter struct {
	client *redis.Client
	limit  int
	window time.Duration
}

func NewSlidingWindowLimiter(client *redis.Client, limit int, window time.Duration) *SlidingWindowLimiter {
	return &SlidingWindowLimiter{
		client: client,
		limit:  limit,
		window: window,
	}
}

func (s *SlidingWindowLimiter) Allow(ctx context.Context, key string) (bool, error) {
	now := time.Now().UnixNano()
	windowStart := now - s.window.Nanoseconds()
	redisKey := fmt.Sprintf("ratelimit:%s", key)

	// Use TxPipeline for atomic execution in Redis (MULTI/EXEC)
	pipe := s.client.TxPipeline()
	
	// Remove older requests outside the window
	pipe.ZRemRangeByScore(ctx, redisKey, "0", fmt.Sprintf("%d", windowStart))
	
	// Add current request
	// Append a random UUID to the member to prevent overwriting concurrent requests
	pipe.ZAdd(ctx, redisKey, redis.Z{
		Score:  float64(now),
		Member: fmt.Sprintf("%d-%s", now, uuid.New().String()),
	})
	
	// Count requests in window
	countCmd := pipe.ZCard(ctx, redisKey)
	
	// Set expiry to clean up memory
	pipe.Expire(ctx, redisKey, s.window)
	
	_, err := pipe.Exec(ctx)
	if err != nil {
		return false, err
	}

	count := countCmd.Val()
	
	if count > int64(s.limit) {
		return false, nil // Limit exceeded
	}

	return true, nil
}
