package catalogue

import (
	"errors"
	"log/slog"

	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type Handler struct {
	repo *Repository
}

const nothingToChange = "Send at least one field to change."

// activeFilter reads ?active=true|false; an absent value lists everything.
func activeFilter(c fiber.Ctx) (*bool, bool) {
	switch c.Query("active") {
	case "":
		return nil, true
	case "true":
		active := true
		return &active, true
	case "false":
		active := false
		return &active, true
	}
	return nil, false
}

func (h *Handler) listProducts(c fiber.Ctx) error {
	active, ok := activeFilter(c)
	if !ok {
		return response.Error(c, 400, "active must be true or false", nil)
	}
	products, err := h.repo.listProducts(c.Context(), active)
	if err != nil {
		return fail(c, err, productTexts)
	}
	return response.List(c, "products retrieved", products)
}

func (h *Handler) createProduct(c fiber.Ctx) error {
	var input ProductFields
	if err := request.DecodeJSON(c, &input); err != nil {
		return response.Error(c, 400, "invalid request body", err.Error())
	}
	input.Normalize()
	product, err := h.repo.createProduct(c.Context(), input)
	if err != nil {
		return fail(c, err, productTexts)
	}
	return response.Success(c, 201, "product created", product)
}

func (h *Handler) updateProduct(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	var patch ProductPatch
	if err = request.DecodeJSON(c, &patch); err != nil {
		return response.Error(c, 400, "invalid request body", err.Error())
	}
	patch.ProductFields.Normalize()
	if patch.ProductFields.empty() && patch.Active == nil {
		return response.Error(c, 400, nothingToChange, nil)
	}
	product, err := h.repo.updateProduct(c.Context(), id, patch)
	if err != nil {
		return fail(c, err, productTexts)
	}
	return response.Success(c, 200, "product updated", product)
}

func (h *Handler) deleteProduct(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	if err = h.repo.deleteProduct(c.Context(), id); err != nil {
		return fail(c, err, productTexts)
	}
	return response.Success(c, 200, "product deleted", nil)
}

func (h *Handler) listLookups(kind lookupKind) fiber.Handler {
	return func(c fiber.Ctx) error {
		active, ok := activeFilter(c)
		if !ok {
			return response.Error(c, 400, "active must be true or false", nil)
		}
		lookups, err := h.repo.listLookups(c.Context(), kind, active)
		if err != nil {
			return fail(c, err, kind.texts)
		}
		return response.List(c, kind.path+" retrieved", lookups)
	}
}

func (h *Handler) createLookup(kind lookupKind) fiber.Handler {
	return func(c fiber.Ctx) error {
		var input LookupInput
		if err := request.DecodeJSON(c, &input); err != nil {
			return response.Error(c, 400, "invalid request body", err.Error())
		}
		input.Normalize()
		lookup, err := h.repo.createLookup(c.Context(), kind, input)
		if err != nil {
			return fail(c, err, kind.texts)
		}
		return response.Success(c, 201, kind.singular+" created", lookup)
	}
}

func (h *Handler) updateLookup(kind lookupKind) fiber.Handler {
	return func(c fiber.Ctx) error {
		id, err := request.UUIDParam(c)
		if err != nil {
			return response.Error(c, 400, err.Error(), nil)
		}
		var patch LookupPatch
		if err = request.DecodeJSON(c, &patch); err != nil {
			return response.Error(c, 400, "invalid request body", err.Error())
		}
		patch.Normalize()
		if patch.empty() {
			return response.Error(c, 400, nothingToChange, nil)
		}
		lookup, err := h.repo.updateLookup(c.Context(), kind, id, patch)
		if err != nil {
			return fail(c, err, kind.texts)
		}
		return response.Success(c, 200, kind.singular+" updated", lookup)
	}
}

func (h *Handler) deleteLookup(kind lookupKind) fiber.Handler {
	return func(c fiber.Ctx) error {
		id, err := request.UUIDParam(c)
		if err != nil {
			return response.Error(c, 400, err.Error(), nil)
		}
		if err = h.repo.deleteLookup(c.Context(), kind, id); err != nil {
			return fail(c, err, kind.texts)
		}
		return response.Success(c, 200, kind.singular+" deleted", nil)
	}
}

// fail sends the response for a catalogue error. Messages for 4xx responses are
// shown to people as they are, so they are full sentences.
func fail(c fiber.Ctx, err error, t texts) error {
	var problems validationError
	var dbError *pgconn.PgError
	switch {
	case errors.As(err, &problems):
		return response.Error(c, 422, "validation failed", map[string]string(problems))
	case errors.Is(err, pgx.ErrNoRows):
		return response.Error(c, 404, t.notFound, nil)
	case errors.Is(err, errInUse):
		return response.Error(c, 409, t.inUse, nil)
	case errors.Is(err, errDuplicateName):
		return response.Error(c, 409, t.duplicate, map[string]string{"name": t.duplicate})
	case errors.As(err, &dbError) && dbError.Code == "23503":
		// The brand or unit was deleted between the check and the write.
		return response.Error(c, 422, "A linked brand or unit of measure no longer exists. Reload and try again.", nil)
	}
	slog.Error("catalogue operation failed", "error", err, "method", c.Method(), "path", c.Path(),
		"request_id", requestid.FromContext(c))
	return response.Error(c, 500, "catalogue operation failed", nil)
}
