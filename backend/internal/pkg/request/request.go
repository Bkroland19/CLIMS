package request

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

func DecodeJSON(c fiber.Ctx, dst any) error {
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return errors.New("expected one JSON object")
	}
	return nil
}

func UUIDParam(c fiber.Ctx) (string, error) {
	return ParseUUID(c.Params("id"))
}

func ParseUUID(value string) (string, error) {
	id, err := uuid.Parse(value)
	if err != nil || id == uuid.Nil || len(value) != 36 {
		return "", errors.New("id must be a nonzero UUID")
	}
	return id.String(), nil
}
