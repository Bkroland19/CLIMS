package validator

import (
	"regexp"
	"strings"

	"github.com/go-playground/validator/v10"
)

var Validate *validator.Validate

func init() {
	Validate = validator.New()

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

func FormatErrors(err error) map[string]string {
	errorsMap := make(map[string]string)
	if validationErrs, ok := err.(validator.ValidationErrors); ok {
		for _, fieldErr := range validationErrs {
			switch fieldErr.Tag() {
			case "valid-sku":
				errorsMap[fieldErr.Field()] = "must start with 'SKU-'"
			case "phone":
				errorsMap[fieldErr.Field()] = "must be 9 to 15 digits with an optional leading +"
			default:
				errorsMap[fieldErr.Field()] = "failed on validation rule: " + fieldErr.Tag()
			}
		}
	} else {
		errorsMap["general"] = err.Error()
	}
	return errorsMap
}
