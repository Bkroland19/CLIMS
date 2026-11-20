package orders

import (
	"errors"
	"strconv"
	"strings"

	"clims-backend/internal/features/rbac"
	"clims-backend/internal/features/users"
	"clims-backend/internal/pkg/request"
	"clims-backend/internal/pkg/response"

	"github.com/gofiber/fiber/v3"
)

func (h *Handler) stockout(c fiber.Ctx) error {
	var input struct {
		HotSpotID string  `json:"hot_spot_id"`
		CondomID  string  `json:"condom_id"`
		UnitID    string  `json:"unit_of_measure_id"`
		Quantity  int32   `json:"quantity_needed"`
		Comment   *string `json:"comment"`
	}
	if err := request.DecodeJSON(c, &input); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	hotSpotID, hotSpotErr := request.ParseUUID(input.HotSpotID)
	productID, productErr := request.ParseUUID(input.CondomID)
	unitID, unitErr := request.ParseUUID(input.UnitID)
	if hotSpotErr != nil || productErr != nil || unitErr != nil || input.Quantity <= 0 {
		return response.Error(c, 422, "provide hotspot, product and unit UUIDs and a positive quantity", nil)
	}
	access := scopeFor(users.CurrentUser(c))
	if !access.allStores && !assigned(access.hotSpotID, hotSpotID) {
		return workflowError(c, errWorkflowForbidden)
	}
	order, err := h.repo.reportStockout(c.Context(), access.userID, hotSpotID, productID, unitID, input.Quantity, input.Comment)
	if err != nil {
		return workflowError(c, err)
	}
	return response.Success(c, 201, "stockout queued", order)
}

var actionPermissions = map[string]string{
	"review": "orders:process", "check-stock": "orders:process", "dispatch": "orders:process",
	"request-replenishment": "orders:replenish", "receive": "orders:receive", "deliver": "orders:deliver",
}

func (h *Handler) action(c fiber.Ctx) error {
	action := c.Params("action")
	permission, exists := actionPermissions[action]
	if !exists {
		return response.Error(c, 404, "unknown order action", nil)
	}
	return rbac.RequirePermission(permission)(c)
}

func (h *Handler) performAction(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	var input ActionInput
	if len(c.Body()) != 0 {
		if err = request.DecodeJSON(c, &input); err != nil {
			return response.Error(c, 400, "invalid request body", nil)
		}
	}
	action := c.Params("action")
	if !validActionInput(action, &input) {
		return workflowError(c, errWorkflowInput)
	}
	order, err := h.repo.act(c.Context(), scopeFor(users.CurrentUser(c)), id, action, input)
	if err != nil {
		return workflowError(c, err)
	}
	status := 200
	if action == "request-replenishment" {
		status = 201
	}
	return response.Success(c, status, "", order)
}

func validActionInput(action string, input *ActionInput) bool {
	for _, id := range []*string{input.WarehouseID, input.RiderID} {
		if id != nil {
			parsed, err := request.ParseUUID(*id)
			if err != nil {
				return false
			}
			*id = parsed
		}
	}
	for _, note := range []*string{input.DiscrepancyNote, input.DeliveryNote} {
		if note != nil {
			*note = strings.TrimSpace(*note)
			if *note == "" || len(*note) > 4000 {
				return false
			}
		}
	}
	if (input.WarehouseID != nil) != (action == "request-replenishment") ||
		(input.DeliveryNote != nil) != (action == "deliver") ||
		(input.QuantityReceived != nil) != (action == "receive") ||
		(input.RiderID != nil && action != "dispatch") ||
		(input.QuantityIssued != nil && (action != "dispatch" || *input.QuantityIssued < 1)) ||
		(input.DiscrepancyNote != nil && action != "receive") {
		return false
	}
	return input.QuantityReceived == nil || *input.QuantityReceived >= 0
}

func (h *Handler) notifications(c fiber.Ctx) error {
	return h.eventList(c, nil)
}

func (h *Handler) events(c fiber.Ctx) error {
	id, err := request.UUIDParam(c)
	if err != nil {
		return response.Error(c, 400, err.Error(), nil)
	}
	return h.eventList(c, &id)
}

func (h *Handler) eventList(c fiber.Ctx, id *string) error {
	offset, err := strconv.ParseInt(c.Query("offset", "0"), 10, 32)
	if err != nil || offset < 0 {
		return response.Error(c, 400, "offset must be nonnegative", nil)
	}
	events, err := h.repo.listEvents(c.Context(), scopeFor(users.CurrentUser(c)), id, int32(offset))
	if err != nil {
		return workflowError(c, err)
	}
	return response.Success(c, 200, "", events)
}

func workflowError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, errWorkflowForbidden):
		return response.Error(c, 403, err.Error(), nil)
	case errors.Is(err, errWorkflowConflict):
		return response.Error(c, 409, err.Error(), nil)
	case errors.Is(err, errWorkflowInput), errors.Is(err, errHotSpotRoute):
		return response.Error(c, 422, err.Error(), nil)
	default:
		return orderError(c, err)
	}
}
