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

// stockout reports that a hotspot has run out of a product. The district's DCFPs are notified; no
// order is created.
func (h *Handler) stockout(c fiber.Ctx) error {
	var input struct {
		HotSpotID string  `json:"hot_spot_id"`
		CondomID  string  `json:"condom_id"`
		Comment   *string `json:"comment"`
	}
	if err := request.DecodeJSON(c, &input); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	hotSpotID, hotSpotErr := request.ParseUUID(input.HotSpotID)
	productID, productErr := request.ParseUUID(input.CondomID)
	if hotSpotErr != nil || productErr != nil {
		return response.Error(c, 422, "provide hotspot and product UUIDs", nil)
	}
	var ok bool
	if input.Comment, ok = trimComment(input.Comment); !ok {
		return response.Error(c, 422, "comment must be at most 4000 characters", nil)
	}
	access := scopeFor(users.CurrentUser(c))
	allowed := access.allStores || assigned(access.hotSpotID, hotSpotID)
	if !allowed && access.stockoutDistrict {
		// A VHT may raise an alert on behalf of any active hotspot in the district they work in.
		var err error
		if allowed, err = h.repo.activeInDistrictOf(c.Context(), access.userID, hotSpotID); err != nil {
			return workflowError(c, err)
		}
	}
	if !allowed {
		return workflowError(c, errWorkflowForbidden)
	}
	report, err := h.repo.reportStockout(c.Context(), access.userID, hotSpotID, productID, input.Comment)
	if err != nil {
		return workflowError(c, err)
	}
	return response.Success(c, 201, "stockout reported to the district", report)
}

func (h *Handler) stockouts(c fiber.Ctx) error {
	limit, offset, ok := page(c)
	if !ok {
		return response.Error(c, 400, pageError, nil)
	}
	var hotSpotID *string
	if raw := c.Query("hot_spot_id"); raw != "" {
		id, err := request.ParseUUID(raw)
		if err != nil {
			return response.Error(c, 400, "hot_spot_id must be a UUID", nil)
		}
		hotSpotID = &id
	}
	reports, err := h.repo.listStockouts(c.Context(), scopeFor(users.CurrentUser(c)), hotSpotID, limit, offset)
	if err != nil {
		return workflowError(c, err)
	}
	return response.Success(c, 200, "", reports)
}

// warehouseRequest places a DCFP's order with NMS or JMS for a product and quantity.
func (h *Handler) warehouseRequest(c fiber.Ctx) error {
	var input WarehouseRequestInput
	if err := request.DecodeJSON(c, &input); err != nil {
		return response.Error(c, 400, "invalid request body", nil)
	}
	warehouseID, warehouseErr := request.ParseUUID(input.WarehouseID)
	productID, productErr := request.ParseUUID(input.CondomID)
	if warehouseErr != nil || productErr != nil {
		return response.Error(c, 422, "provide warehouse_store_id and condom_id UUIDs", nil)
	}
	input.WarehouseID, input.CondomID = warehouseID, productID
	if input.UnitOfMeasureID != nil {
		unitID, err := request.ParseUUID(*input.UnitOfMeasureID)
		if err != nil {
			return response.Error(c, 422, "unit_of_measure_id must be a UUID", nil)
		}
		input.UnitOfMeasureID = &unitID
	}
	if input.Quantity < 1 {
		const message = "quantity must be a positive whole number"
		return response.Error(c, 422, message, map[string]string{"quantity": message})
	}
	var ok bool
	if input.Comment, ok = trimComment(input.Comment); !ok {
		return response.Error(c, 422, "comment must be at most 4000 characters", nil)
	}
	order, err := h.repo.createWarehouseRequest(c.Context(), scopeFor(users.CurrentUser(c)), input)
	if err != nil {
		return workflowError(c, err)
	}
	return response.Success(c, 201, "order sent to the warehouse", order)
}

var actionPermissions = map[string]string{
	"review": "orders:process", "check-stock": "orders:process", "dispatch": "orders:process",
	"receive": "orders:receive",
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
	return response.Success(c, 200, "", order)
}

// validActionInput accepts only the fields an action uses: an optional positive quantity_issued at
// dispatch, and a nonnegative quantity_received with an optional discrepancy_note at receipt.
func validActionInput(action string, input *ActionInput) bool {
	if input.DiscrepancyNote != nil {
		*input.DiscrepancyNote = strings.TrimSpace(*input.DiscrepancyNote)
		if *input.DiscrepancyNote == "" || len(*input.DiscrepancyNote) > 4000 {
			return false
		}
	}
	if (input.QuantityReceived != nil) != (action == "receive") ||
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
	case errors.Is(err, errWorkflowForbidden), errors.Is(err, errNotDistrictStore):
		return response.Error(c, 403, err.Error(), nil)
	case errors.Is(err, errWorkflowConflict):
		return response.Error(c, 409, err.Error(), nil)
	case errors.Is(err, errWorkflowInput), errors.Is(err, errHotSpotRoute), errors.Is(err, errUnknownProduct):
		return response.Error(c, 422, err.Error(), nil)
	case errors.Is(err, errNotWarehouse):
		return response.Error(c, 422, err.Error(), map[string]string{"warehouse_store_id": err.Error()})
	case errors.Is(err, errNoUnit):
		return response.Error(c, 422, err.Error(), map[string]string{"unit_of_measure_id": err.Error()})
	default:
		return orderError(c, err)
	}
}

// trimComment trims a free-text message, dropping it when blank. The result is false when it is
// longer than the 4000 characters the API accepts.
func trimComment(comment *string) (*string, bool) {
	if comment == nil {
		return nil, true
	}
	trimmed := strings.TrimSpace(*comment)
	if trimmed == "" {
		return nil, true
	}
	return &trimmed, len(trimmed) <= 4000
}
