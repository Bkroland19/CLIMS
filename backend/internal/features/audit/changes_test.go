package audit

import (
	"context"
	"reflect"
	"testing"
)

type account struct {
	Name         string   `json:"name"`
	Status       string   `json:"status"`
	Roles        []string `json:"roles"`
	PasswordHash string   `json:"password_hash"`
	RefreshToken string
	Shipping     string `json:"shipping_note"`
}

func TestDiffKeepsOnlyChangedNonSecretFields(t *testing.T) {
	before := account{Name: "Jane", Status: "active", Roles: []string{"vht"}, PasswordHash: "old", RefreshToken: "a", Shipping: "x"}
	after := account{Name: "Jane", Status: "disabled", Roles: []string{"vht", "dfcp"}, PasswordHash: "new", RefreshToken: "b", Shipping: "y"}
	got := Diff(before, after)
	want := map[string]Change{
		"status":        {Before: "active", After: "disabled"},
		"roles":         {Before: []any{"vht"}, After: []any{"vht", "dfcp"}},
		"shipping_note": {Before: "x", After: "y"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
}

func TestDiffOfCreationAndDeletion(t *testing.T) {
	created := Diff(nil, account{Name: "Jane", PasswordHash: "secret"})
	if created["name"].After != "Jane" || created["name"].Before != nil {
		t.Fatalf("creation: %#v", created)
	}
	if _, leaked := created["password_hash"]; leaked {
		t.Fatal("a password hash was recorded on creation")
	}
	deleted := Diff(account{Name: "Jane"}, nil)
	if deleted["name"].Before != "Jane" || deleted["name"].After != nil {
		t.Fatalf("deletion: %#v", deleted)
	}
	if len(Diff(account{Name: "Jane"}, account{Name: "Jane"})) != 0 {
		t.Fatal("identical values produced changes")
	}
	touched := Diff(map[string]any{"name": "Jane", "updated_at": "monday"}, map[string]any{"name": "Jane", "updated_at": "tuesday"})
	if len(touched) != 0 {
		t.Fatalf("a timestamp alone produced changes: %v", touched)
	}
}

func TestSecretWords(t *testing.T) {
	for field, want := range map[string]bool{
		"password": true, "password_hash": true, "RefreshToken": true, "api_secret": true, "otp": true,
		"shipping": false, "hashtag": false, "opinion": false, "name": false, "store_id": false,
	} {
		if secret(field) != want {
			t.Errorf("secret(%q) = %v", field, !want)
		}
	}
	clean := scrub(map[string]any{"identifier": "jane@example.test", "password": "hunter2"})
	if _, leaked := clean["password"]; leaked || clean["identifier"] != "jane@example.test" {
		t.Fatalf("scrub: %v", clean)
	}
}

func TestSubjectsListTargetFirstWithoutDuplicates(t *testing.T) {
	hotspot := Subject{Type: "hotspot", ID: "h1"}
	types, ids := subjects(Entry{Target: &hotspot, Related: []Subject{{"district", "d1"}, hotspot, {"", "x"}}})
	if !reflect.DeepEqual(types, []string{"hotspot", "district"}) || !reflect.DeepEqual(ids, []string{"h1", "d1"}) {
		t.Fatalf("subjects %v %v", types, ids)
	}
}

func TestRequestContext(t *testing.T) {
	if !Anonymous(context.Background()) {
		t.Fatal("a bare context should be anonymous")
	}
	job := WithSystemActor(context.Background(), "create-admin")
	if Anonymous(job) || requestFrom(job).system != "create-admin" {
		t.Fatal("a system actor should not be anonymous")
	}
	// A service's request keeps its address but drops any signed-in user.
	signedIn := context.WithValue(context.Background(), contextKey{}, &requestInfo{ip: "10.0.0.5", actorID: func() string { return "u1" }})
	service := requestFrom(AsSystemActor(signedIn, "identity-sync:kc"))
	if service.system != "identity-sync:kc" || service.ip != "10.0.0.5" || service.actorID() != "" {
		t.Fatalf("service request: %+v", service)
	}
}
