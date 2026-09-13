package metrics

import (
	"fmt"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Registry is a tiny, dependency-free Prometheus text-format metrics registry.
// The gateway deliberately avoids pulling the full prometheus client library
// to keep the Go module tree minimal; this covers counters, and uptime/state
// gauges in exposition format 0.0.4.

var (
	requestsTotal     atomic.Int64
	rateLimitedTotal  atomic.Int64
	unauthorizedTotal atomic.Int64
	proxiedTotal      atomic.Int64

	startTime = time.Now()

	// latencySum / latencyCount power a mean (not a histogram; good enough
	// for a gateway overview and zero deps).
	latencySumMicros atomic.Int64
	latencyCount     atomic.Int64

	routeCounters sync.Map // route string -> *atomic.Int64
)

// ObserveRequest records one proxied request for gateway metrics.
func ObserveRequest(route string, status int, elapsed time.Duration) {
	proxiedTotal.Add(1)
	latencySumMicros.Add(elapsed.Microseconds())
	latencyCount.Add(1)
	if c, ok := routeCounters.Load(route); ok {
		c.(*atomic.Int64).Add(1)
	} else {
		actual, _ := routeCounters.LoadOrStore(route, new(atomic.Int64))
		actual.(*atomic.Int64).Add(1)
	}
}

// ObserveRateLimited records a request rejected by the limiter.
func ObserveRateLimited() { rateLimitedTotal.Add(1) }

// ObserveUnauthorized records a request rejected by JWT verification.
func ObserveUnauthorized() { unauthorizedTotal.Add(1) }

// ObserveRequestStarted records an accepted request (pre-auth).
func ObserveRequestStarted() { requestsTotal.Add(1) }

// Handler serves the Prometheus text exposition format on /metrics.
func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

		uptime := time.Since(startTime).Seconds()
		lt := latencyCount.Load()
		mean := float64(0)
		if lt > 0 {
			mean = float64(latencySumMicros.Load()) / float64(lt) / 1000.0 // ms
		}

		lines := []string{
			"# HELP sentinel_gateway_requests_total Total accepted requests.",
			"# TYPE sentinel_gateway_requests_total counter",
			fmt.Sprintf("sentinel_gateway_requests_total %d", requestsTotal.Load()),
			"# HELP sentinel_gateway_proxied_total Requests forwarded upstream.",
			"# TYPE sentinel_gateway_proxied_total counter",
			fmt.Sprintf("sentinel_gateway_proxied_total %d", proxiedTotal.Load()),
			"# HELP sentinel_gateway_rate_limited_total Requests rejected by the rate limiter.",
			"# TYPE sentinel_gateway_rate_limited_total counter",
			fmt.Sprintf("sentinel_gateway_rate_limited_total %d", rateLimitedTotal.Load()),
			"# HELP sentinel_gateway_unauthorized_total Requests rejected by JWT verification.",
			"# TYPE sentinel_gateway_unauthorized_total counter",
			fmt.Sprintf("sentinel_gateway_unauthorized_total %d", unauthorizedTotal.Load()),
			"# HELP sentinel_gateway_uplink_latency_ms Mean upstream latency in milliseconds.",
			"# TYPE sentinel_gateway_uplink_latency_ms gauge",
			fmt.Sprintf("sentinel_gateway_uplink_latency_ms %.3f", mean),
			"# HELP sentinel_gateway_uptime_seconds Gateway uptime in seconds.",
			"# TYPE sentinel_gateway_uptime_seconds gauge",
			fmt.Sprintf("sentinel_gateway_uptime_seconds %.1f", uptime),
		}

		// Per-route counters, deterministic order.
		type rc struct{ route string; n int64 }
		routes := make([]rc, 0)
		routeCounters.Range(func(k, v any) bool {
			routes = append(routes, rc{k.(string), v.(*atomic.Int64).Load()})
			return true
		})
		sort.Slice(routes, func(i, j int) bool { return routes[i].route < routes[j].route })

		if len(routes) > 0 {
			lines = append(lines,
				"# HELP sentinel_gateway_route_requests_total Requests per downstream route.",
				"# TYPE sentinel_gateway_route_requests_total counter")
			for _, rt := range routes {
				lines = append(lines, fmt.Sprintf("sentinel_gateway_route_requests_total{route=%q} %d", rt.route, rt.n))
			}
		}

		for _, line := range lines {
			fmt.Fprintln(w, line)
		}
	})
}
