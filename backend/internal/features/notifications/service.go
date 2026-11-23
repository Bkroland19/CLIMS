package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"sync"
	"text/template"

	"github.com/jackc/pgx/v5"
)

// Notifier is what features depend on. Create one Service in main and pass it in;
// tests can pass a fake.
type Notifier interface {
	// Register adds a notification type. Call it at startup.
	Register(Type) error
	// Notify records a notification inside the caller's transaction, so it exists
	// only if the change that caused it commits.
	Notify(ctx context.Context, tx pgx.Tx, msg Message) error
}

var (
	ErrUnknownType  = errors.New("notification type is not registered")
	ErrNoTargets    = errors.New("notification needs at least one target")
	ErrEmptyTarget  = errors.New("a notification target must set at least one filter")
	typeNamePattern = regexp.MustCompile(`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`)
)

type registeredType struct {
	Type
	title    *template.Template
	body     *template.Template
	pushBody *template.Template
}

// Service is the Notifier. Its channels deliver a recorded notification to its recipients.
type Service struct {
	mu       sync.RWMutex
	types    map[string]registeredType
	channels map[string]Channel
}

// NewService returns a Notifier that delivers in-app. Call EnablePush to add push.
func NewService() *Service {
	return &Service{
		types:    map[string]registeredType{},
		channels: map[string]Channel{ChannelInApp: inAppChannel{}},
	}
}

// EnablePush makes types that list ChannelPush queue pushes for a PushWorker to send. Without it
// (no Firebase credentials) push is skipped like any other channel that is not available, and the
// in-app inbox still receives every notification.
func (s *Service) EnablePush() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.channels[ChannelPush] = pushChannel{}
}

func (s *Service) Register(t Type) error {
	if !typeNamePattern.MatchString(t.Name) {
		return fmt.Errorf("notification type %q must look like feature.event", t.Name)
	}
	if len(t.Channels) == 0 {
		return fmt.Errorf("notification type %s declares no channels", t.Name)
	}
	for _, channel := range t.Channels {
		if !slices.Contains([]string{ChannelInApp, ChannelPush, ChannelEmail, ChannelSMS}, channel) {
			return fmt.Errorf("notification type %s: unknown channel %q", t.Name, channel)
		}
	}
	// A missing template field is a programming error, so fail instead of printing "<no value>".
	title, err := template.New(t.Name + ".title").Option("missingkey=error").Parse(t.Title)
	if err != nil {
		return fmt.Errorf("notification type %s title: %w", t.Name, err)
	}
	body, err := template.New(t.Name + ".body").Option("missingkey=error").Parse(t.Body)
	if err != nil {
		return fmt.Errorf("notification type %s body: %w", t.Name, err)
	}
	var pushBody *template.Template
	if t.PushBody != "" {
		if pushBody, err = template.New(t.Name + ".push").Option("missingkey=error").Parse(t.PushBody); err != nil {
			return fmt.Errorf("notification type %s push body: %w", t.Name, err)
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.types[t.Name]; exists {
		return fmt.Errorf("notification type %s is already registered", t.Name)
	}
	s.types[t.Name] = registeredType{Type: t, title: title, body: body, pushBody: pushBody}
	return nil
}

// MustRegister registers types at startup and panics on a programming error.
func (s *Service) MustRegister(types ...Type) {
	for _, t := range types {
		if err := s.Register(t); err != nil {
			panic(err)
		}
	}
}

func (s *Service) Notify(ctx context.Context, tx pgx.Tx, msg Message) error {
	s.mu.RLock()
	t, ok := s.types[msg.Type]
	channels := make(map[string]Channel, len(t.Channels))
	for _, name := range t.Channels {
		if channel, available := s.channels[name]; available {
			channels[name] = channel
		}
	}
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("%w: %s", ErrUnknownType, msg.Type)
	}
	if len(msg.Targets) == 0 {
		return ErrNoTargets
	}
	for _, target := range msg.Targets {
		if target.empty() {
			return ErrEmptyTarget
		}
	}
	title, body, err := t.render(msg.Data)
	if err != nil {
		return err
	}
	var excluded *string
	if !t.IncludeActor {
		excluded = msg.ActorID
	}
	recipients, err := resolveTargets(ctx, tx, msg.Targets, excluded)
	if err != nil || len(recipients) == 0 {
		return err
	}
	id, inserted, err := insertNotification(ctx, tx, msg, title, body)
	if err != nil || !inserted {
		return err
	}
	delivery := Delivery{NotificationID: id, Recipients: recipients, PushTitle: title, PushBody: body}
	if _, push := channels[ChannelPush]; push && t.pushBody != nil {
		if delivery.PushBody, err = execute(t.pushBody, msg.Data); err != nil {
			return fmt.Errorf("render %s push body: %w", t.Name, err)
		}
	}
	for _, name := range t.Channels {
		channel, available := channels[name]
		if !available {
			continue // Push without Firebase, and email and SMS ahead of having a provider.
		}
		if err := channel.Deliver(ctx, tx, delivery); err != nil {
			return fmt.Errorf("deliver %s via %s: %w", msg.Type, name, err)
		}
	}
	return nil
}

func execute(tmpl *template.Template, data map[string]any) (string, error) {
	var out bytes.Buffer
	if err := tmpl.Execute(&out, data); err != nil {
		return "", err
	}
	return out.String(), nil
}

func (t registeredType) render(data map[string]any) (string, string, error) {
	var title, body bytes.Buffer
	if err := t.title.Execute(&title, data); err != nil {
		return "", "", fmt.Errorf("render %s title: %w", t.Name, err)
	}
	if err := t.body.Execute(&body, data); err != nil {
		return "", "", fmt.Errorf("render %s body: %w", t.Name, err)
	}
	return title.String(), body.String(), nil
}

// insertNotification stores the send once. It reports false when the type and
// idempotency key were already used, so the repeat is skipped.
func insertNotification(ctx context.Context, tx pgx.Tx, msg Message, title, body string) (string, bool, error) {
	data, err := json.Marshal(msg.Data)
	if err != nil {
		return "", false, fmt.Errorf("encode %s data: %w", msg.Type, err)
	}
	if msg.Data == nil {
		data = []byte(`{}`)
	}
	var resourceType, resourceID, key *string
	if msg.Resource != nil {
		resourceType, resourceID = &msg.Resource.Type, &msg.Resource.ID
	}
	if msg.IdempotencyKey != "" {
		key = &msg.IdempotencyKey
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO notifications
		(type, title, body, resource_type, resource_id, actor_id, data, idempotency_key)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (type, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
		RETURNING id`, msg.Type, title, body, resourceType, resourceID, msg.ActorID, data, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	return id, err == nil, err
}
