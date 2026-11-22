package middleware

import (
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
)

// ipApp echoes c.IP(). Requests made with app.Test arrive from 0.0.0.0.
func ipApp(trustedProxies []string) *fiber.App {
	app := fiber.New(WithClientIP(fiber.Config{}, trustedProxies))
	app.Use(ClientIP())
	app.Get("/", func(c fiber.Ctx) error { return c.SendString(c.IP()) })
	return app
}

func clientIP(t *testing.T, app *fiber.App, header string) string {
	t.Helper()
	req := httptest.NewRequest("GET", "/", nil)
	if header != "" {
		req.Header.Set(ClientIPHeader, header)
	}
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func TestClientIPFromTrustedProxy(t *testing.T) {
	app := ipApp([]string{"0.0.0.0/32"})
	if got := clientIP(t, app, "203.0.113.7"); got != "203.0.113.7" {
		t.Fatalf("trusted proxy's client address: got %q", got)
	}
	if got := clientIP(t, app, "2001:db8::7"); got != "2001:db8::7" {
		t.Fatalf("IPv6 client address: got %q", got)
	}
	// A trusted peer without a usable header falls back to the connection address.
	for _, header := range []string{"", "not-an-ip", "203.0.113.7, 198.51.100.9"} {
		if got := clientIP(t, app, header); got != "0.0.0.0" {
			t.Fatalf("header %q: got %q, want the connection address", header, got)
		}
	}
}

func TestClientIPIgnoresUntrustedPeers(t *testing.T) {
	// The request comes from 0.0.0.0, which is not in the list, so its header is a spoof.
	if got := clientIP(t, ipApp([]string{"10.0.0.1"}), "203.0.113.7"); got != "0.0.0.0" {
		t.Fatalf("untrusted peer set the client address: got %q", got)
	}
	// With no list, only private networks are trusted, and 0.0.0.0 is not one.
	if got := clientIP(t, ipApp(nil), "203.0.113.7"); got != "0.0.0.0" {
		t.Fatalf("default trust accepted a non-private peer: got %q", got)
	}
}
