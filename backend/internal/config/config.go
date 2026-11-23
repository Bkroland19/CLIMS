package config

import (
	"fmt"
	"net"
	"net/url"

	"github.com/spf13/viper"
)

type Config struct {
	// AppEnv names the deployment: development, test or production. Unset means production.
	AppEnv    string `mapstructure:"APP_ENV"`
	Port      string `mapstructure:"PORT"`
	DBHost    string `mapstructure:"DB_HOST"`
	DBPort    string `mapstructure:"DB_PORT"`
	DBUser    string `mapstructure:"DB_USER"`
	DBPass    string `mapstructure:"DB_PASSWORD"`
	DBName    string `mapstructure:"DB_NAME"`
	DBSSLMode string `mapstructure:"DB_SSLMODE"`
	JWTSecret string `mapstructure:"JWT_SECRET"`
	// Portal sign-in through Keycloak. Leave OIDC_CLIENT_ID empty to turn it off.
	OIDCIssuer       string `mapstructure:"OIDC_ISSUER"`
	OIDCClientID     string `mapstructure:"OIDC_CLIENT_ID"`
	OIDCClientSecret string `mapstructure:"OIDC_CLIENT_SECRET"`
	OIDCPublicOrigin string `mapstructure:"OIDC_PUBLIC_ORIGIN"`
	// The dashboard's reconciler client. Leave empty to turn identity sync off.
	IdentitySyncClientID string `mapstructure:"IDENTITY_SYNC_CLIENT_ID"`
	// "1" adds the identity-sync session probe for the conformance suite. It needs APP_ENV development
	// or test; see IdentitySyncProbe.
	IdentitySyncTestProbe string `mapstructure:"IDENTITY_SYNC_TEST_PROBE"`
}

func LoadConfig() (cfg Config, err error) {
	v := viper.New()
	v.SetDefault("PORT", "8080")
	v.SetDefault("DB_PORT", "5432")
	v.SetDefault("DB_HOST", "localhost")
	v.SetDefault("DB_SSLMODE", "disable")
	// Binding includes environment-only keys in Unmarshal.
	for _, key := range []string{"APP_ENV", "PORT", "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_SSLMODE", "JWT_SECRET",
		"OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_PUBLIC_ORIGIN", "IDENTITY_SYNC_CLIENT_ID", "IDENTITY_SYNC_TEST_PROBE"} {
		if err := v.BindEnv(key); err != nil {
			return cfg, err
		}
	}
	if err = v.Unmarshal(&cfg); err != nil {
		return cfg, err
	}
	for _, setting := range []struct{ name, value string }{
		{"DB_USER", cfg.DBUser}, {"DB_PASSWORD", cfg.DBPass}, {"DB_NAME", cfg.DBName}, {"JWT_SECRET", cfg.JWTSecret},
	} {
		if setting.value == "" {
			return cfg, fmt.Errorf("%s is required", setting.name)
		}
	}
	return cfg, nil
}

func (cfg *Config) DSN() string {
	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(cfg.DBUser, cfg.DBPass),
		Host:   net.JoinHostPort(cfg.DBHost, cfg.DBPort),
		Path:   "/" + cfg.DBName,
	}
	query := url.Values{"sslmode": {cfg.DBSSLMode}}
	u.RawQuery = query.Encode()
	return u.String()
}

// IdentitySyncProbe decides whether the identity-sync test session probe is on. appEnv and probe are
// the APP_ENV and IDENTITY_SYNC_TEST_PROBE values. The probe is on only with IDENTITY_SYNC_TEST_PROBE=1
// and APP_ENV set exactly to development or test. Any other non-empty probe value, or the probe in
// production (including an unset APP_ENV), is a configuration error, so the server refuses to start.
func IdentitySyncProbe(appEnv, probe string) (bool, error) {
	if probe == "" {
		return false, nil
	}
	if probe != "1" {
		return false, fmt.Errorf("IDENTITY_SYNC_TEST_PROBE must be unset or 1")
	}
	if appEnv != "development" && appEnv != "test" {
		return false, fmt.Errorf("IDENTITY_SYNC_TEST_PROBE=1 requires APP_ENV to be development or test; it must never be set in production")
	}
	return true, nil
}
