package notifications

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestPushBodyIsCheckedAtRegistration(t *testing.T) {
	typ := validType()
	typ.Channels = []string{ChannelInApp, ChannelPush}
	typ.PushBody = "{{.name"
	if err := NewService().Register(typ); err == nil {
		t.Fatal("a broken push body should fail at registration")
	}
	typ.PushBody = "{{.name}} needs a look."
	s := NewService()
	if err := s.Register(typ); err != nil {
		t.Fatal(err)
	}
	got, err := execute(s.types[typ.Name].pushBody, map[string]any{"name": "Mama's Bar"})
	if err != nil || got != "Mama's Bar needs a look." {
		t.Fatalf("push body %q, %v", got, err)
	}
}

func TestPushIsAvailableOnlyOnceEnabled(t *testing.T) {
	s := NewService()
	if _, ok := s.channels[ChannelPush]; ok {
		t.Fatal("push must stay off without Firebase credentials")
	}
	s.EnablePush()
	if _, ok := s.channels[ChannelPush].(pushChannel); !ok {
		t.Fatal("EnablePush should add the push channel")
	}
}

func TestClassifyFCM(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   string // "ok", "invalid", "permanent", "retry"
	}{
		{"sent", 200, `{"name":"projects/p/messages/1"}`, "ok"},
		{"unregistered", 404, `{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}`, "invalid"},
		{"bad token", 400, `{"error":{"status":"INVALID_ARGUMENT","message":"The registration token is not a valid FCM registration token"}}`, "invalid"},
		{"other project", 403, `{"error":{"status":"PERMISSION_DENIED","details":[{"errorCode":"SENDER_ID_MISMATCH"}]}}`, "invalid"},
		{"bad payload", 400, `{"error":{"status":"INVALID_ARGUMENT","message":"Invalid value at 'message.data'"}}`, "permanent"},
		{"rate limited", 429, `{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"errorCode":"QUOTA_EXCEEDED"}]}}`, "retry"},
		{"down", 503, `{"error":{"status":"UNAVAILABLE"}}`, "retry"},
		{"no body", 500, ``, "retry"},
		{"credentials", 401, `{"error":{"status":"UNAUTHENTICATED"}}`, "retry"},
	}
	for _, c := range cases {
		err := classifyFCM(c.status, []byte(c.body))
		var permanent permanentError
		got := "retry"
		switch {
		case err == nil:
			got = "ok"
		case errors.Is(err, ErrInvalidToken):
			got = "invalid"
		case errors.As(err, &permanent):
			got = "permanent"
		}
		if got != c.want {
			t.Errorf("%s: got %s (%v), want %s", c.name, got, err, c.want)
		}
	}
}

// The app reads title and message to display the push and body as its data (expo-notifications).
func TestFCMPayloadIsDataOnlyForExpo(t *testing.T) {
	raw, err := fcmPayload(PushMessage{Token: "tok", Title: "Deliver to Kisenyi", Body: "Carry 2 boxes.",
		Data: map[string]string{"notification_id": "n1", "delivery_id": "d1"}})
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Message struct {
			Token        string            `json:"token"`
			Data         map[string]string `json:"data"`
			Notification any               `json:"notification"`
			Android      map[string]any    `json:"android"`
		} `json:"message"`
	}
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	m := got.Message
	if m.Token != "tok" || m.Notification != nil || m.Data["title"] != "Deliver to Kisenyi" ||
		m.Data["message"] != "Carry 2 boxes." || m.Data["channelId"] != AndroidChannelID || m.Android["priority"] != "HIGH" {
		t.Fatalf("payload %s", raw)
	}
	var data map[string]string
	if err := json.Unmarshal([]byte(m.Data["body"]), &data); err != nil || data["delivery_id"] != "d1" {
		t.Fatalf("body should carry the data as JSON: %q", m.Data["body"])
	}
}

func TestNewFCMChecksTheKey(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, _ := x509.MarshalPKCS8PrivateKey(key)
	pemKey := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	account := func(mutate func(map[string]string)) []byte {
		sa := map[string]string{"type": "service_account", "project_id": "clims-test",
			"client_email": "push@clims-test.iam.gserviceaccount.com", "private_key": pemKey}
		mutate(sa)
		raw, _ := json.Marshal(sa)
		return raw
	}
	fcm, err := NewFCM(account(func(map[string]string) {}))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(fcm.endpoint, "/projects/clims-test/messages:send") {
		t.Fatalf("endpoint %s", fcm.endpoint)
	}
	for name, mutate := range map[string]func(map[string]string){
		"google-services.json": func(sa map[string]string) { delete(sa, "type") },
		"no project":           func(sa map[string]string) { sa["project_id"] = "" },
		"bad key":              func(sa map[string]string) { sa["private_key"] = "not a key" },
	} {
		if _, err := NewFCM(account(mutate)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
	if _, err := NewFCM([]byte("{")); err == nil {
		t.Error("broken JSON should fail")
	}

	// The environment variable takes the key as JSON or base64; nothing set means push is off.
	raw := account(func(map[string]string) {})
	for name, value := range map[string]string{
		"json": "  " + string(raw) + "\n", "base64": base64.StdEncoding.EncodeToString(raw),
	} {
		if fcm, err := ConfiguredFCM(value, ""); err != nil || fcm == nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	if fcm, err := ConfiguredFCM("", ""); fcm != nil || err != nil {
		t.Errorf("unset should turn push off without an error: %v", err)
	}
	if _, err := ConfiguredFCM("not base64!", ""); err == nil {
		t.Error("garbage should fail")
	}
	if _, err := ConfiguredFCM("", "/nonexistent/firebase.json"); err == nil {
		t.Error("a missing file should fail")
	}
}

func TestBackoffGrows(t *testing.T) {
	if backoff(1) != 30*time.Second || backoff(5) != 8*time.Minute {
		t.Fatalf("backoff %v, %v", backoff(1), backoff(5))
	}
}
