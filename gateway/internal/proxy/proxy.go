package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
)

// NewReverseProxy creates a reverse proxy for a given target URL
func NewReverseProxy(target string) (*httputil.ReverseProxy, error) {
	parsedURL, err := url.Parse(target)
	if err != nil {
		return nil, err
	}

	proxy := httputil.NewSingleHostReverseProxy(parsedURL)

	// Configure a custom transport with higher MaxIdleConnsPerHost to prevent port exhaustion
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.MaxIdleConnsPerHost = 100
	proxy.Transport = transport

	// Optionally, we can customize the Director to rewrite headers or paths
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		// For Sentinel, we preserve the Host header so downstream services know the original host
		req.Header.Set("X-Forwarded-Host", req.Header.Get("Host"))
	}

	return proxy, nil
}
