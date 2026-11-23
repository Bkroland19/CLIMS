import { refOf } from "../notifications";
import { pushDataOf, toApiNotification } from "../push";

describe("pushDataOf", () => {
  const data = {
    notification_id: "n-1",
    user_id: "u-1",
    type: "order.delivery_assigned",
    resource_type: "hotspot",
    resource_id: "h-1",
    report_id: "r-1",
    delivery_id: "d-1",
  };

  it("reads the data expo-notifications parsed from the push", () => {
    expect(pushDataOf(data)).toEqual(data);
  });

  it("parses the raw FCM body when it arrives unparsed", () => {
    expect(pushDataOf({ title: "t", message: "m", body: JSON.stringify(data) })).toEqual(data);
  });

  it("ignores pushes that are not from CLIMS", () => {
    expect(pushDataOf(null)).toBeNull();
    expect(pushDataOf({})).toBeNull();
    expect(pushDataOf({ body: "not json" })).toBeNull();
    expect(pushDataOf({ type: "order.hotspot_delivery" })).toBeNull();
  });
});

describe("toApiNotification", () => {
  it("opens the same screen as the inbox entry would", () => {
    const delivery = pushDataOf({
      notification_id: "n-1",
      type: "order.delivery_assigned",
      report_id: "r-1",
      delivery_id: "d-1",
    })!;
    expect(refOf(toApiNotification(delivery, "Deliver to Kisenyi", "Carry 2 boxes"))).toBe(
      "DLV-d-1",
    );

    const stock = pushDataOf({
      notification_id: "n-2",
      type: "order.hotspot_delivery",
      resource_type: "hotspot",
      resource_id: "h-1",
      report_id: "r-2",
    })!;
    expect(refOf(toApiNotification(stock, null, null))).toBe("STK-r-2");

    const hotspot = pushDataOf({
      notification_id: "n-3",
      type: "hotspot.activated",
      resource_type: "hotspot",
      resource_id: "h-9",
    })!;
    const n = toApiNotification(hotspot, "Hotspot activated", undefined);
    expect(refOf(n)).toBe("HS-h-9");
    expect(n).toMatchObject({ id: "n-3", title: "Hotspot activated", body: "", read_at: null });
  });
});
