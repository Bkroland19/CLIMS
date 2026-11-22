import React, { useCallback, useState } from "react";
import { isAxiosError } from "axios";
import { useFocusEffect } from "expo-router";
import Screen from "@/components/m/Screen";
import { Banner, Btn, Hero, List, Row, SkeletonList } from "@/components/m/kit";
import { isNetworkError } from "@/lib/hotspots";
import { listStockouts, toLocalOrder } from "@/lib/orders";
import { useT } from "@/lib/theme";
import { ago, chip, items, orderChip } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { HM_HOTSPOT } from "@/lib/seed";
import { useMe } from "@/lib/session";
import { useStore } from "@/lib/store";
import { stockStats } from "./common";
import { orderMsg, orderSteps } from "./order";

/** Hotspot manager home: sample data for demo sign-ins, the API for signed-in managers. */
export function HmHome() {
  const me = useMe();
  return me.demo ? <HmHomeSample /> : <HmHomeLive />;
}

/** Hotspot manager orders: sample data for demo sign-ins, the API for signed-in managers. */
export function HmOrders() {
  const me = useMe();
  return me.demo ? <HmOrdersSample /> : <HmOrdersLive />;
}

function HmHomeSample() {
  const T = useT();
  const nav = useNav();
  const me = useMe();
  const { s } = useStore();
  const h = s.hotspots.find((x) => x.id === HM_HOTSPOT);
  if (!h)
    return (
      <Screen title="Home" root>
        <Banner
          tone="neutral"
          title="No hotspot linked to your account"
          body="Call your district focal person."
        />
      </Screen>
    );
  const mine = s.orders
    .filter((o) => o.hotspotId === h.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const o = mine.find((x) => x.status !== "received");
  const queued = s.outbox.some((it) => it.type === "notify" && it.payload.hotspotId === h.id);
  return (
    <Screen title="Home" root>
      <Hero
        title={h.name}
        sub={`${h.id} · ${h.village}, ${h.subcounty}`}
        chip={chip(h.status, "success")}
        stats={stockStats(T, h)}
        msg={`Last delivery ${h.lastDelivery != null ? ago(h.lastDelivery) : "none yet"}`}
      >
        {!o ? (
          <Btn label="Report stockout" icon="megaphone" onPress={() => nav.go("request")} />
        ) : null}
      </Hero>
      {queued ? (
        <Banner
          tone="warning"
          title="Stockout saved on this phone"
          body="It sends to the district when you are back online."
        />
      ) : null}
      {o ? (
        <Hero
          h="Current order"
          title={items(o.approved)}
          sub={`Sent ${ago(o.createdAt)}`}
          chip={orderChip(o.status)}
          steps={orderSteps(o, true)}
          msg={orderMsg(o, true, me.name)}
        >
          {o.status === "delivered" ? (
            <Btn label="Confirm receipt" onPress={() => nav.go(`order/${o.id}`)} />
          ) : (
            <Btn label="View order" kind="secondary" onPress={() => nav.go(`order/${o.id}`)} />
          )}
        </Hero>
      ) : null}
    </Screen>
  );
}

function HmOrdersSample() {
  const nav = useNav();
  const { s } = useStore();
  const mine = s.orders
    .filter((o) => o.hotspotId === HM_HOTSPOT)
    .sort((a, b) => b.createdAt - a.createdAt);
  const q0 = s.outbox.filter((it) => it.type === "notify" && it.payload.hotspotId === HM_HOTSPOT);
  return (
    <Screen
      title="Orders"
      root
      fab={{
        label: "Report stockout",
        icon: "megaphone",
        onPress: () => nav.go("request"),
      }}
    >
      {q0.length ? (
        <List h="Waiting to send">
          {q0.map((it) => (
            <Row
              key={it.id}
              t="Stockout notification"
              s={`${items(it.payload.items)} · saved ${ago(it.at)}`}
              chip={chip("Offline", "warning")}
              ic="upload"
            />
          ))}
        </List>
      ) : null}
      <List h={q0.length ? "Sent" : undefined} empty="No orders yet.">
        {mine.map((o) => (
          <Row
            key={o.id}
            t={items(o.items)}
            s={`Sent ${ago(o.createdAt)}`}
            chip={orderChip(o.status)}
            chev
            fw={o.status === "delivered" ? "600" : "400"}
            onPress={() => nav.go(`order/${o.id}`)}
          />
        ))}
      </List>
    </Screen>
  );
}

/* ───────── Signed-in hotspot manager (API) ───────── */

type Load = "loading" | "ok" | "offline" | "forbidden" | "error";

/**
 * The manager's hotspot stockout notifications from GET /orders/stockouts, reloaded whenever the
 * screen is shown. The phone's copy stays on screen while offline.
 */
function useApiOrders() {
  const me = useMe();
  const { s, syncApiOrders } = useStore();
  const [load, setLoad] = useState<Load>("loading");
  useFocusEffect(
    useCallback(() => {
      let live = true;
      listStockouts()
        .then((reports) => {
          if (!live) return;
          syncApiOrders(reports.map((r) => toLocalOrder(r, me.name, "Hotspot manager")));
          setLoad("ok");
        })
        .catch((e: unknown) => {
          if (!live) return;
          setLoad(
            isNetworkError(e)
              ? "offline"
              : isAxiosError(e) && e.response?.status === 403
                ? "forbidden"
                : "error",
          );
        });
      return () => {
        live = false;
      };
    }, [me.name, syncApiOrders]),
  );
  const orders = s.orders
    .filter((o) => o.source === "api")
    .sort((a, b) => b.createdAt - a.createdAt);
  const queued = s.outbox.filter((it) => it.type === "stockout");
  return { orders, queued, load };
}

function LoadBanner({ load, any }: { load: Load; any: boolean }) {
  if (load === "forbidden")
    return (
      <Banner
        tone="warning"
        title="Can't load your orders"
        body="Your account can't view orders yet. Call your district focal person."
      />
    );
  if (load === "offline" && any)
    return <Banner tone="neutral" title="Offline" body="Showing your orders as last loaded." />;
  if (load === "error")
    return <Banner tone="warning" title="Couldn't refresh your orders" body="Try again shortly." />;
  return null;
}

function HmHomeLive() {
  const nav = useNav();
  const me = useMe();
  const { orders, queued, load } = useApiOrders();
  // A delivered notification stays open until the manager acknowledges what arrived.
  const open = orders.find((o) => o.status !== "received");
  if (!me.hotspotId)
    return (
      <Screen title="Home" root>
        <Banner
          tone="neutral"
          title="No hotspot linked to your account"
          body="Call your district focal person to link your hotspot."
        />
      </Screen>
    );
  return (
    <Screen title="Home" root>
      <LoadBanner load={load} any={orders.length > 0} />
      <Hero
        title="Your hotspot"
        sub="Report a stockout and the district focal person sends stock."
        msg={
          open
            ? `Latest request: ${open.product ?? "condoms"}, ${orderChip(open.status).label.toLowerCase()} · ${ago(open.createdAt)}`
            : "No open requests."
        }
      >
        <Btn label="Report stockout" icon="megaphone" onPress={() => nav.go("request")} />
      </Hero>
      {queued.length ? (
        <Banner
          tone="warning"
          title="Stockout saved on this phone"
          body="It sends to the district when you are back online."
        />
      ) : null}
      {load === "loading" && !orders.length ? (
        <SkeletonList h="Recent requests" rows={3} />
      ) : (
        <List h="Recent requests" empty="No requests yet.">
          {orders.slice(0, 3).map((o) => (
            <Row
              key={o.id}
              t={o.product ?? "Condoms"}
              s={`Sent ${ago(o.createdAt)}`}
              chip={orderChip(o.status)}
              chev
              onPress={() => nav.go(`stockout/${o.id}`)}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}

function HmOrdersLive() {
  const nav = useNav();
  const { orders, queued, load } = useApiOrders();
  return (
    <Screen
      title="Orders"
      root
      fab={{
        label: "Report stockout",
        icon: "megaphone",
        onPress: () => nav.go("request"),
      }}
    >
      <LoadBanner load={load} any={orders.length > 0} />
      {queued.length ? (
        <List h="Waiting to send">
          {queued.map((it) => (
            <Row
              key={it.id}
              t={it.payload.product ?? "Stockout"}
              s={`Saved ${ago(it.at)}`}
              chip={chip("Offline", "warning")}
              ic="upload"
            />
          ))}
        </List>
      ) : null}
      {load === "loading" && !orders.length ? (
        <SkeletonList rows={5} />
      ) : (
        <List h={queued.length ? "Sent" : undefined} empty="No orders yet.">
          {orders.map((o) => (
            <Row
              key={o.id}
              t={o.product ?? "Condoms"}
              s={`${o.note ? `${o.note} · ` : ""}${ago(o.createdAt)}`}
              chip={orderChip(o.status)}
              chev
              onPress={() => nav.go(`stockout/${o.id}`)}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}
