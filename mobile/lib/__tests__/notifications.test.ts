import { type AxiosAdapter } from "axios";
import { api } from "../api";
import {
  isUnread,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  refOf,
  toInboxEvent,
  type ApiNotification,
} from "../notifications";

/** Answers requests by method and path, and records what was sent. */
function serve(routes: Record<string, { status: number; data?: unknown }>) {
  const sent: { method?: string; url?: string; params?: unknown }[] = [];
  const adapter: AxiosAdapter = async (cfg) => {
    sent.push({ method: cfg.method, url: cfg.url, params: cfg.params });
    const r = routes[`${cfg.method?.toUpperCase()} ${cfg.url}`] ?? { status: 404 };
    return { data: r.data, status: r.status, statusText: "", headers: {}, config: cfg };
  };
  api.defaults.adapter = adapter;
  return sent;
}

const delivery: ApiNotification = {
  id: "n1",
  type: "order.hotspot_delivery",
  title: "Stock is on its way to Kisenyi Landing",
  body: "200 female condoms were sent from the district store.",
  resource_type: "hotspot",
  resource_id: "h1",
  data: { report_id: "r1", hotspot: "Kisenyi Landing" },
  read_at: null,
  created_at: "2026-11-23T08:00:00Z",
};

const activated: ApiNotification = {
  ...delivery,
  id: "n2",
  type: "hotspot.activated",
  title: "Hotspot activated: Kisenyi Landing",
  body: "Kisenyi Landing in Wakiso is now active. Comment: Verified",
  data: { name: "Kisenyi Landing", district: "Wakiso" },
  read_at: "2026-11-23T09:00:00Z",
};

describe("the notifications API", () => {
  it("lists the inbox newest first, a page at a time", async () => {
    const sent = serve({ "GET /notifications": { status: 200, data: { data: [delivery] } } });
    await expect(listNotifications()).resolves.toEqual([delivery]);
    expect(sent[0].params).toEqual({ limit: 100, offset: 0 });
  });

  it("marks one, or all, read", async () => {
    const sent = serve({
      "POST /notifications/n1/read": { status: 200, data: {} },
      "POST /notifications/read-all": { status: 200, data: { data: { marked: 2 } } },
    });
    await markNotificationRead("n1");
    await markAllNotificationsRead();
    expect(sent.map((r) => r.url)).toEqual(["/notifications/n1/read", "/notifications/read-all"]);
  });
});

describe("refOf", () => {
  it("opens the stockout a delivery belongs to", () => {
    expect(refOf(delivery)).toBe("STK-r1");
  });
  it("opens the hotspot a decision is about", () => {
    expect(refOf(activated)).toBe("HS-h1");
  });
  it("opens nothing when the notification names no record", () => {
    expect(
      refOf({ type: "system.notice", resource_type: null, resource_id: null, data: null }),
    ).toBe("");
  });
  it("opens the delivery a delivery agent was named for", () => {
    expect(
      refOf({
        ...delivery,
        type: "order.delivery_assigned",
        data: { report_id: "r1", delivery_id: "d9" },
      }),
    ).toBe("DLV-d9");
  });
});

describe("toInboxEvent", () => {
  it("keeps the server's title, message, time and read state", () => {
    expect(toInboxEvent(delivery, "hm")).toMatchObject({
      id: "N-n1",
      serverId: "n1",
      t: Date.parse("2026-11-23T08:00:00Z"),
      ref: "STK-r1",
      text: "Stock is on its way to Kisenyi Landing",
      body: "200 female condoms were sent from the district store.",
      readAt: null,
      to: ["hm"],
    });
  });
  it("names the district a decision came from", () => {
    expect(toInboxEvent(activated, "vht")).toMatchObject({
      role: "DCFP",
      org: "Wakiso district",
      readAt: Date.parse("2026-11-23T09:00:00Z"),
    });
  });
  it("falls back to the focal person when the district is not given", () => {
    expect(toInboxEvent(delivery, "hm").org).toBe("District focal person");
  });
});

describe("isUnread", () => {
  it("reads API notifications by their own read time, and local ones by the last look", () => {
    expect(isUnread(toInboxEvent(delivery, "hm"), Date.now())).toBe(true);
    expect(isUnread(toInboxEvent(activated, "vht"), 0)).toBe(false);
    const local = {
      id: "e",
      t: 100,
      ref: "",
      role: "System" as const,
      actor: "CLIMS",
      text: "",
      to: [],
    };
    expect(isUnread(local, 50)).toBe(true);
    expect(isUnread(local, 150)).toBe(false);
  });
});
