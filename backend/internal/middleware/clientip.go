package middleware

import (
	"net"

	"github.com/gofiber/fiber/v3"
)

// ClientIPHeader carries the client's address from nginx. nginx overwrites it with the
// address that connected to it (proxy_set_header X-Real-IP $remote_addr), so a client cannot
// supply its own value through nginx, unlike X-Forwarded-For, which nginx appends to.
const ClientIPHeader = "X-Real-IP"

// WithClientIP configures cfg so c.IP() is the client's real address behind nginx. The
// header is trusted only on requests from trustedProxies (IPs or CIDR ranges), or from private
// networks when none are given: the API is reachable only on the container network, where nginx
// is its caller. Everywhere c.IP() is used benefits, including login sessions, the request log
// and the per-IP rate limits. Use it with ClientIP.
func WithClientIP(cfg fiber.Config, trustedProxies []string) fiber.Config {
	cfg.TrustProxy = true
	cfg.ProxyHeader = ClientIPHeader
	cfg.EnableIPValidation = true
	if len(trustedProxies) > 0 {
		cfg.TrustProxyConfig = fiber.TrustProxyConfig{Proxies: trustedProxies}
	} else {
		cfg.TrustProxyConfig = fiber.TrustProxyConfig{Private: true}
	}
	return cfg
}

// ClientIP falls back to the connection's address when a trusted peer sends no valid
// X-Real-IP, for example another container calling the API directly. Without it, c.IP() would
// be empty for those requests. Register it before any middleware that reads c.IP().
func ClientIP() fiber.Handler {
	return func(c fiber.Ctx) error {
		if c.IsProxyTrusted() && net.ParseIP(c.Get(ClientIPHeader)) == nil {
			if remote := c.RequestCtx().RemoteIP(); remote != nil {
				c.Request().Header.Set(ClientIPHeader, remote.String())
			}
		}
		return c.Next()
	}
}
