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

func TestIdentitySyncProbe(t *testing.T) {
	for _, tc := range []struct {
		appEnv, probe string
		want, err     bool
	}{
		{"", "", false, false},
		{"production", "", false, false},
		{"development", "", false, false},
		{"development", "1", true, false},
		{"test", "1", true, false},
		// An unset APP_ENV means production.
		{"", "1", false, true},
		{"production", "1", false, true},
		{"production", "0", false, true},
		{"production", "true", false, true},
		{"staging", "1", false, true},
		{"Production", "1", false, true},
		{" development", "1", false, true},
		{"development", "true", false, true},
		{"development", "0", false, true},
		{"test", "yes", false, true},
		{"test", " 1", false, true},
	} {
		got, err := IdentitySyncProbe(tc.appEnv, tc.probe)
		if got != tc.want || (err != nil) != tc.err {
			t.Errorf("APP_ENV=%q IDENTITY_SYNC_TEST_PROBE=%q: got (%v, %v), want (%v, error=%v)",
				tc.appEnv, tc.probe, got, err, tc.want, tc.err)
		}
	}
}

func TestLoadConfigReadsAppEnv(t *testing.T) {
	for key, value := range map[string]string{
		"DB_USER": "u", "DB_PASSWORD": "p", "DB_NAME": "n", "JWT_SECRET": "s", "APP_ENV": "test", "IDENTITY_SYNC_TEST_PROBE": "1",
	} {
		t.Setenv(key, value)
	}
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AppEnv != "test" || cfg.IdentitySyncTestProbe != "1" {
		t.Fatalf("APP_ENV %q, probe %q", cfg.AppEnv, cfg.IdentitySyncTestProbe)
	}
}
