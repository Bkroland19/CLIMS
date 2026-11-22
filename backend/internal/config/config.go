package config

import (
	"fmt"
	"net"
	"net/url"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Port      string `mapstructure:"PORT"`
	DBHost    string `mapstructure:"DB_HOST"`
	DBPort    string `mapstructure:"DB_PORT"`
	DBUser    string `mapstructure:"DB_USER"`
	DBPass    string `mapstructure:"DB_PASSWORD"`
	DBName    string `mapstructure:"DB_NAME"`
	DBSSLMode string `mapstructure:"DB_SSLMODE"`
	JWTSecret string `mapstructure:"JWT_SECRET"`
	// TrustedProxiesSetting is TRUSTED_PROXIES: comma-separated IPs or CIDR ranges allowed to
	// report the client address. Empty trusts private networks, where nginx reaches the API.
	TrustedProxiesSetting string `mapstructure:"TRUSTED_PROXIES"`
	// TrustedProxies is TrustedProxiesSetting parsed and validated.
	TrustedProxies []string `mapstructure:"-"`
}

func LoadConfig() (cfg Config, err error) {
	v := viper.New()
	v.SetDefault("PORT", "8080")
	v.SetDefault("DB_PORT", "5432")
	v.SetDefault("DB_HOST", "localhost")
	v.SetDefault("DB_SSLMODE", "disable")
	// Binding includes environment-only keys in Unmarshal.
	for _, key := range []string{"PORT", "DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME", "DB_SSLMODE", "JWT_SECRET", "TRUSTED_PROXIES"} {
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
	if cfg.TrustedProxies, err = parseTrustedProxies(cfg.TrustedProxiesSetting); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// parseTrustedProxies splits TRUSTED_PROXIES and rejects anything that is not an IP or CIDR,
// so a typo fails at startup instead of trusting the wrong addresses.
func parseTrustedProxies(setting string) ([]string, error) {
	var proxies []string
	for _, entry := range strings.Split(setting, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if net.ParseIP(entry) == nil {
			if _, _, err := net.ParseCIDR(entry); err != nil {
				return nil, fmt.Errorf("TRUSTED_PROXIES: %q is not an IP address or CIDR range", entry)
			}
		}
		proxies = append(proxies, entry)
	}
	return proxies, nil
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
