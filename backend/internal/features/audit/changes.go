package audit

import (
	"encoding/json"
	"reflect"
	"strings"
	"unicode"
)

// Change is a field's value before and after an action.
type Change struct {
	Before any `json:"before"`
	After  any `json:"after"`
}

// Fields with any of these words in their name are never stored, whatever the
// struct says: password_hash, refresh_token and api_secret all match.
var secretWords = map[string]bool{
	"password": true, "passcode": true, "token": true, "secret": true, "hash": true, "otp": true, "pin": true,
}

// secret reports whether a field name contains a secret word. Whole words only, so
// "shipping" or "hashtag" are kept. Both snake_case and CamelCase names are split.
func secret(field string) bool {
	var spaced strings.Builder
	for i, r := range field {
		if i > 0 && unicode.IsUpper(r) {
			spaced.WriteByte(' ')
		}
		spaced.WriteRune(r)
	}
	words := strings.FieldsFunc(strings.ToLower(spaced.String()), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9')
	})
	for _, word := range words {
		if secretWords[word] {
			return true
		}
	}
	return false
}

// bookkeeping fields change with every write and say nothing about what was done;
// the entry's own time already records when.
var bookkeeping = map[string]bool{"created_at": true, "updated_at": true}

// Diff returns the fields that differ between before and after, by their JSON
// names, leaving out secrets and row timestamps. Pass nil before for a creation and nil after for a
// deletion. Values that cannot be encoded as JSON objects produce no changes.
func Diff(before, after any) map[string]Change {
	old, current := fields(before), fields(after)
	changes := map[string]Change{}
	for name := range bookkeeping {
		delete(old, name)
		delete(current, name)
	}
	for name, value := range current {
		if !secret(name) && !reflect.DeepEqual(old[name], value) {
			changes[name] = Change{Before: old[name], After: value}
		}
	}
	for name, value := range old {
		if _, kept := current[name]; !kept && !secret(name) {
			changes[name] = Change{Before: value, After: nil}
		}
	}
	return changes
}

func fields(value any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return map[string]any{}
	}
	var decoded map[string]any
	if json.Unmarshal(encoded, &decoded) != nil {
		return map[string]any{}
	}
	return decoded
}

// scrub drops secret keys from details, so a caller cannot store one by mistake.
func scrub(details map[string]any) map[string]any {
	clean := map[string]any{}
	for key, value := range details {
		if !secret(key) {
			clean[key] = value
		}
	}
	return clean
}
