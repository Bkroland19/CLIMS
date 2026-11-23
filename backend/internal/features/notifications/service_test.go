package notifications

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func validType() Type {
	return Type{
		Name:     "hotspot.submitted",
		Title:    "New hotspot: {{.name}}",
		Body:     "{{.name}} in {{.district}} needs verification.",
		Channels: []string{ChannelInApp, ChannelSMS},
	}
}

func TestRegisterRejectsInvalidTypes(t *testing.T) {
	cases := map[string]func(*Type){
		"bad name":        func(t *Type) { t.Name = "HotspotSubmitted" },
		"no channels":     func(t *Type) { t.Channels = nil },
		"unknown channel": func(t *Type) { t.Channels = []string{"pigeon"} },
		"bad title":       func(t *Type) { t.Title = "{{.name" },
		"bad body":        func(t *Type) { t.Body = "{{if}}" },
	}
	for name, mutate := range cases {
		typ := validType()
		mutate(&typ)
		if err := NewService().Register(typ); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	s := NewService()
	if err := s.Register(validType()); err != nil {
		t.Fatal(err)
	}
	if err := s.Register(validType()); err == nil {
		t.Error("registering a type twice should fail")
	}
}

func TestRenderFillsTemplatesAndRejectsMissingData(t *testing.T) {
	s := NewService()
	s.MustRegister(validType())
	typ := s.types["hotspot.submitted"]
	title, body, err := typ.render(map[string]any{"name": "Mama's Bar", "district": "Wakiso"})
	if err != nil {
		t.Fatal(err)
	}
	if title != "New hotspot: Mama's Bar" || body != "Mama's Bar in Wakiso needs verification." {
		t.Fatalf("rendered %q / %q", title, body)
	}
	if _, _, err = typ.render(map[string]any{"name": "Mama's Bar"}); err == nil || !strings.Contains(err.Error(), "district") {
		t.Fatalf("missing template data should fail, got %v", err)
	}
}

// These checks run before Notify touches the transaction, so no database is needed.
func TestNotifyValidatesBeforeWriting(t *testing.T) {
	s := NewService()
	s.MustRegister(validType())
	data := map[string]any{"name": "Bar", "district": "Wakiso"}
	cases := map[string]struct {
		msg  Message
		want error
	}{
		"unknown type": {Message{Type: "hotspot.unknown", Targets: []Target{{Role: "dfcp"}}}, ErrUnknownType},
		"no targets":   {Message{Type: "hotspot.submitted", Data: data}, ErrNoTargets},
		"empty target": {Message{Type: "hotspot.submitted", Data: data, Targets: []Target{{}}}, ErrEmptyTarget},
	}
	for name, tc := range cases {
		if err := s.Notify(context.Background(), nil, tc.msg); !errors.Is(err, tc.want) {
			t.Errorf("%s: got %v, want %v", name, err, tc.want)
		}
	}
	missing := Message{Type: "hotspot.submitted", Targets: []Target{{Role: "dfcp"}}, Data: map[string]any{}}
	if err := s.Notify(context.Background(), nil, missing); err == nil {
		t.Error("missing template data should fail before writing")
	}
}
