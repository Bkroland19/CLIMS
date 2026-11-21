package validator

import (
	"reflect"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"
)

var Validate *validator.Validate

func init() {
	Validate = validator.New()

	// Report fields by their JSON names, which is what clients send and show errors against.
	Validate.RegisterTagNameFunc(func(field reflect.StructField) string {
		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		switch name {
		case "-":
			return ""
		case "":
			return field.Name
		}
		return name
	})

	// Register a custom validation rule: "valid-sku"
	// Usage in struct tags: validate:"required,valid-sku"
	_ = Validate.RegisterValidation("valid-sku", validateSKU)
	// Usage in struct tags: validate:"required,phone"
	_ = Validate.RegisterValidation("phone", validatePhone)
}

var phonePattern = regexp.MustCompile(`^\+?[0-9]{9,15}$`)

// Phone numbers are digits with an optional leading +; strip spaces and dashes first.
func validatePhone(fl validator.FieldLevel) bool {
	phone, ok := fl.Field().Interface().(string)
	return ok && phonePattern.MatchString(phone)
}

// Custom validation function checking if string starts with "SKU-"
func validateSKU(fl validator.FieldLevel) bool {
	sku, ok := fl.Field().Interface().(string)
	if !ok {
		return false
	}
	return strings.HasPrefix(sku, "SKU-")
}

// listIndex matches the element suffix that dive adds, as in role_ids[2].
var listIndex = regexp.MustCompile(`\[\d+\]$`)

// FormatErrors maps each invalid field's JSON name to one message a person can act on.
// Messages are written to sit under the field, so they do not repeat its name.
// Optional overrides replace a message, keyed by "field.rule", e.g. "unit_id.required".
func FormatErrors(err error, overrides ...map[string]string) map[string]string {
	errorsMap := make(map[string]string)
	validationErrs, ok := err.(validator.ValidationErrors)
	if !ok {
		errorsMap["general"] = err.Error()
		return errorsMap
	}
	for _, fieldErr := range validationErrs {
		field := listIndex.ReplaceAllString(fieldErr.Field(), "")
		if _, reported := errorsMap[field]; reported {
			continue
		}
		message := describe(fieldErr)
		for _, set := range overrides {
			if custom, found := set[field+"."+fieldErr.Tag()]; found {
				message = custom
			}
		}
		errorsMap[field] = message
	}
	return errorsMap
}

func describe(fieldErr validator.FieldError) string {
	param := fieldErr.Param()
	text := fieldErr.Kind() == reflect.String
	list := fieldErr.Kind() == reflect.Slice || fieldErr.Kind() == reflect.Array
	switch fieldErr.Tag() {
	case "required":
		return "This field is required."
	case "min", "gte":
		switch {
		case text:
			return "Use at least " + param + " " + plural(param, "character") + "."
		case list:
			return "Choose at least " + param + "."
		}
		return "Must be at least " + formatNumber(param) + "."
	case "max", "lte":
		switch {
		case text:
			return "Use at most " + param + " " + plural(param, "character") + "."
		case list:
			return "Choose at most " + param + "."
		}
		return "Must be at most " + formatNumber(param) + "."
	case "len":
		if text {
			return "Use exactly " + param + " " + plural(param, "character") + "."
		}
		return "Must be exactly " + formatNumber(param) + "."
	case "oneof":
		return "Choose one of: " + strings.Join(strings.Fields(param), ", ") + "."
	case "email":
		return "Enter a valid email address, e.g. name@example.org."
	case "uuid", "uuid4", "uuid_rfc4122", "uuid4_rfc4122":
		return "Choose a valid item from the list."
	case "phone":
		return "Use 9 to 15 digits with an optional leading +."
	case "valid-sku":
		return "Must start with 'SKU-'."
	}
	return "Check this value."
}

func plural(count, noun string) string {
	if count == "1" {
		return noun
	}
	return noun + "s"
}

// formatNumber adds thousands separators to whole numbers, e.g. 100000 → 100,000.
func formatNumber(value string) string {
	number, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return value
	}
	digits := strconv.FormatInt(max(number, -number), 10)
	var grouped strings.Builder
	if number < 0 {
		grouped.WriteByte('-')
	}
	for i, digit := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			grouped.WriteByte(',')
		}
		grouped.WriteRune(digit)
	}
	return grouped.String()
}
