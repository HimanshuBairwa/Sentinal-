package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"
)

// NewReverseProxy creates a reverse proxy for a given target URL.
func NewReverseProxy(target string) (*httputil.ReverseProxy, error) {
	parsedURL, err := url.Parse(target)
	if err != nil {
		return nil, err
	}

	proxy := httputil.NewSingleHostReverseProxy(parsedURL)

	// Configure a custom transport with higher MaxIdleConnsPerHost to prevent
	// port exhaustion and sane timeouts for the request path.
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConnsPerHost = 100
	transport.IdleConnTimeout = 90 * time.Second
	proxy.Transport = transport

	// Flush immediately so streamed responses (WebSocket upgrade data, SSE)
	// are not buffered by the proxy.
	proxy.FlushInterval = 100 * time.Millisecond

	// Rewrite the Director to preserve the original host so downstream
	// services know the original request host.
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Header.Set("X-Forwarded-Host", req.Header.Get("Host"))
		req.Header.Set("X-Forwarded-Proto", "http")
	}

	// Surface upstream failures as a clean 502 with a JSON body instead of
	// an empty default response.
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		w.Write([]byte(`{"error":"upstream service unavailable"}`))
	}

	return proxy, nil
}
