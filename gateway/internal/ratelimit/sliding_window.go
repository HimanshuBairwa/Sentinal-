package ratelimit

import (
	"context"
	"fmt"
	"time"

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

	// Pipeline for atomic execution (mostly)
	// For perfect atomicity in Redis cluster, a Lua script is preferred.
	// But pipeline is fast enough for API Gateway rate limiting.
	pipe := s.client.Pipeline()
	
	// Remove older requests outside the window
	pipe.ZRemRangeByScore(ctx, redisKey, "0", fmt.Sprintf("%d", windowStart))
	
	// Add current request
	pipe.ZAdd(ctx, redisKey, redis.Z{
		Score:  float64(now),
		Member: now,
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
