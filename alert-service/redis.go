package main

import (
	"context"
	"fmt"

	"github.com/go-redis/redis/v8"
)

var (
	// Lua script for Rate Limiting and Deduplication.
	// Returns 1 if allowed, 0 if blocked (deduplicated or rate limited).
	alertLuaScript = redis.NewScript(`
		local dedupKey = KEYS[1]
		local rateLimitKey = KEYS[2]
		local dedupTTL = tonumber(ARGV[1])
		local rateLimitAmount = tonumber(ARGV[2])
		local rateLimitTTL = tonumber(ARGV[3])
		
		-- Check deduplication
		if redis.call("EXISTS", dedupKey) == 1 then
			return 0
		end
		
		-- Check rate limit
		local current = redis.call("GET", rateLimitKey)
		if current and tonumber(current) >= rateLimitAmount then
			return 0
		end
		
		-- Mark dedup
		redis.call("SET", dedupKey, "1", "EX", dedupTTL)
		
		-- Increment rate limit
		current = redis.call("INCR", rateLimitKey)
		if tonumber(current) == 1 then
			redis.call("EXPIRE", rateLimitKey, rateLimitTTL)
		end
		
		return 1
	`)
)

type RedisClient struct {
	client *redis.Client
	ctx    context.Context
}

func NewRedisClient(addr string) *RedisClient {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})
	// go-redis v8 requires a context; keep a background context at the client level.
	return &RedisClient{client: rdb, ctx: context.Background()}
}

// Ping verifies Redis connectivity for the health endpoint.
func (r *RedisClient) Ping() error {
	return r.client.Ping(r.ctx).Err()
}

// AllowAlert checks if the alert should be allowed based on dedup and rate limiting.
func (r *RedisClient) AllowAlert(ctx context.Context, alertID, userID string) (bool, error) {
	dedupKey := fmt.Sprintf("dedup:alert:%s", alertID)
	rateLimitKey := fmt.Sprintf("ratelimit:user:%s", userID)
	
	// Deduplicate for 10 minutes (600 seconds)
	// Rate limit: 5 alerts per minute (60 seconds)
	res, err := alertLuaScript.Run(ctx, r.client, []string{dedupKey, rateLimitKey}, 600, 5, 60).Result()
	if err != nil {
		return false, err
	}
	
	return res.(int64) == 1, nil
}
