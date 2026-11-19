import React from "react";
import Screen from "@/components/m/Screen";
import { Banner, Btn, Hero, List, Row } from "@/components/m/kit";
import { useT } from "@/lib/theme";
import { ago, chip, items, orderChip, periodOf } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { currentPeriod, HM_HOTSPOT } from "@/lib/seed";
import { useMe } from "@/lib/session";
import { useStore } from "@/lib/store";
import { stockStats } from "./common";
import { orderMsg, orderSteps } from "./order";
import { REPORT_CHIP } from "./reports";

export function HmHome() {
  const T = useT();
  const nav = useNav();
  const me = useMe();
  const { s } = useStore();
  const h = s.hotspots.find((x) => x.id === HM_HOTSPOT);
  if (!h) return <Screen title="Home" root><Banner tone="neutral" title="No hotspot linked to your account" body="Call your district focal person." /></Screen>;
  const mine = s.orders.filter((o) => o.hotspotId === h.id).sort((a, b) => b.createdAt - a.createdAt);
  const o = mine.find((x) => x.status !== "received");
  const queued = s.outbox.some((it) => it.type === "notify" && it.payload.hotspotId === h.id);
  const period = currentPeriod();
  const rpt = s.reports.find((r) => r.own === "hm" && r.period === period);
  return (
    <Screen title="Home" root>
      <Hero
        title={h.name}
        sub={`${h.id} · ${h.village}, ${h.subcounty}`}
        chip={chip(h.status, "success")}
        stats={stockStats(T, h)}
        msg={`Last delivery ${h.lastDelivery != null ? ago(h.lastDelivery) : "none yet"}`}
      >
        {!o ? <Btn label="Report stockout" icon="megaphone" onPress={() => nav.go("request")} /> : null}
      </Hero>
      {queued ? <Banner tone="warning" title="Stockout saved on this phone" body="It sends to the district when you are back online." /> : null}
      {o ? (
        <Hero h="Current order" title={o.id} sub={`${items(o.approved)} · sent ${ago(o.createdAt)}`} chip={orderChip(o.status)} steps={orderSteps(o, true)} msg={orderMsg(o, true, me.name)}>
          {o.status === "delivered" ? (
            <Btn label="Confirm receipt" onPress={() => nav.go(`order/${o.id}`)} />
          ) : (
            <Btn label="View order" kind="secondary" onPress={() => nav.go(`order/${o.id}`)} />
          )}
        </Hero>
      ) : null}
      {rpt ? (
        <List h="Monthly report">
          <Row
            t={periodOf(rpt.period).label}
            s={rpt.status === "sent" ? `Sent ${ago(rpt.sentAt)}` : `Due ${periodOf(rpt.period).due}`}
            chip={REPORT_CHIP[rpt.status]}
            ic="clipboard"
            chev
            onPress={() => nav.go(`report/${rpt.id}`)}
          />
        </List>
      ) : null}
    </Screen>
  );
}

export function HmOrders() {
  const nav = useNav();
  const { s } = useStore();
  const mine = s.orders.filter((o) => o.hotspotId === HM_HOTSPOT).sort((a, b) => b.createdAt - a.createdAt);
  const q0 = s.outbox.filter((it) => it.type === "notify" && it.payload.hotspotId === HM_HOTSPOT);
  return (
    <Screen title="Orders" root fab={{ label: "Report stockout", icon: "megaphone", onPress: () => nav.go("request") }}>
      {q0.length ? (
        <List h="Waiting to send">
          {q0.map((it) => (
            <Row key={it.id} t="Stockout notification" s={`${items(it.payload.items)} · saved ${ago(it.at)}`} chip={chip("Offline", "warning")} ic="upload" />
          ))}
        </List>
      ) : null}
      <List h={q0.length ? "Sent" : undefined} empty="No orders yet.">
        {mine.map((o) => (
          <Row
            key={o.id}
            t={o.id}
            s={`${items(o.items)} · ${ago(o.createdAt)}`}
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
