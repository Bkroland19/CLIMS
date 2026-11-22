package config

import (
	"net/url"
	"testing"
)

func TestEnvironmentConfigAndEscapedDSN(t *testing.T) {
	for key, value := range map[string]string{
		"DB_HOST": "::1", "DB_PORT": "5432", "DB_USER": "user@example",
		"DB_PASSWORD": "p@ss:/?#&", "DB_NAME": "clims", "JWT_SECRET": "test-secret", "DB_SSLMODE": "require",
	} {
		t.Setenv(key, value)
	}
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(cfg.DSN())
	if err != nil {
		t.Fatal(err)
	}
	password, _ := u.User.Password()
	if u.User.Username() != "user@example" || password != "p@ss:/?#&" || u.Host != "[::1]:5432" || u.Query().Get("sslmode") != "require" {
		t.Fatal("DSN did not preserve credentials, IPv6 host, or SSL mode")
	}
}

func TestMissingJWTSecret(t *testing.T) {
	t.Setenv("DB_USER", "test")
	t.Setenv("DB_PASSWORD", "test")
	t.Setenv("DB_NAME", "test")
	t.Setenv("JWT_SECRET", "")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("expected missing JWT_SECRET to fail")
	}
}

func TestTrustedProxies(t *testing.T) {
	t.Setenv("DB_USER", "test")
	t.Setenv("DB_PASSWORD", "test")
	t.Setenv("DB_NAME", "test")
	t.Setenv("JWT_SECRET", "test")
	t.Setenv("TRUSTED_PROXIES", " 172.21.0.6, 10.0.0.0/8 ,,2001:db8::/32 ")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.TrustedProxies) != 3 || cfg.TrustedProxies[0] != "172.21.0.6" || cfg.TrustedProxies[2] != "2001:db8::/32" {
		t.Fatalf("parsed %v", cfg.TrustedProxies)
	}
	t.Setenv("TRUSTED_PROXIES", "")
	if cfg, err = LoadConfig(); err != nil || cfg.TrustedProxies != nil {
		t.Fatalf("unset should mean no explicit list: %v %v", cfg.TrustedProxies, err)
	}
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8,nginx")
	if _, err = LoadConfig(); err == nil {
		t.Fatal("a value that is not an IP or CIDR should fail at startup")
	}
}
