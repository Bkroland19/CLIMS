import React, { useState } from "react";
import Screen from "@/components/m/Screen";
import { Banner, Btn, Btns, Check, Fields, Hero, Input, List, Row, Stepper, type StepItem } from "@/components/m/kit";
import { PhotoField } from "@/components/m/media";
import { ago, items, lineRows, num, orderChip, PRODUCTS, toInt } from "@/lib/format";
import { TAB_LABEL, useNav } from "@/lib/nav";
import { useMe } from "@/lib/session";
import { usePending, useStore } from "@/lib/store";
import type { Order, Qty } from "@/lib/types";
import { call } from "./common";

const RANK: Record<Order["status"], number> = {
  queued: 0, review: 1, on_hold: 1, confirmed: 2, dispatched: 3, in_transit: 3, delivered: 4, received: 5,
};

export function orderSteps(o: Order, you: boolean): StepItem[] {
  const dl = o.delivery;
  const st = o.status;
  const rank = RANK[st];
  return [
    { label: "Sent to district", st: "done", sub: ago(o.createdAt) },
    st === "on_hold"
      ? { label: "Waiting for stock", st: "warn", sub: "District is restocking" }
      : { label: "Confirmed by district", st: rank >= 2 ? "done" : "cur", sub: o.confirmedAt != null ? ago(o.confirmedAt) : "" },
    { label: "On the way", st: rank >= 4 ? "done" : rank >= 2 ? "cur" : "todo", sub: dl?.pickedAt != null ? ago(dl.pickedAt) : dl?.rider ?? "" },
    { label: "Delivered", st: rank >= 4 ? "done" : "todo", sub: dl?.deliveredAt != null ? ago(dl.deliveredAt) : "" },
    { label: you ? "You confirmed" : "Receipt confirmed", st: rank === 5 ? "done" : rank === 4 ? "cur" : "todo", sub: o.receipt ? ago(o.receipt.at) : "" },
  ];
}

export function orderMsg(o: Order, you: boolean, contact: string) {
  const dl = o.delivery;
  return {
    queued: "The district has the notification and will review it shortly.",
    review: "The district is checking stock for this order.",
    on_hold: "The district store is restocking from the warehouse. This order is first in line when stock arrives.",
    confirmed: "Confirmed. The district is assigning a rider.",
    dispatched: `${dl?.rider} will collect the condoms from the district store.`,
    in_transit: `${dl?.rider} is on the way with delivery note ${dl?.dn}.${you ? " Sign the note when you receive the stock." : ""}`,
    delivered: you ? "The rider has delivered. Count the stock and confirm what you received." : `Delivered. ${contact} needs to confirm receipt.`,
    received: `Closed ${o.receipt ? ago(o.receipt.at) : ""}.`,
  }[o.status];
}

function ConfirmForm({ o }: { o: Order }) {
  const { send } = useStore();
  const noted: Qty = o.delivery?.qty ?? o.approved;
  const [vals, setVals] = useState<Record<string, string>>({});
  const [issue, setIssue] = useState("");
  const [signed, setSigned] = useState(false);
  const got = { male: 0, female: 0 } as Qty;
  const lines = PRODUCTS.filter((p) => noted[p.k] > 0);
  lines.forEach((p) => {
    got[p.k] = toInt(vals[p.k] ?? String(noted[p.k]));
  });
  const mismatch = PRODUCTS.some((p) => got[p.k] !== (noted[p.k] || 0));
  return (
    <>
      <Fields h="Count what you received">
        {lines.map((p) => (
          <Stepper
            key={p.k}
            label={p.name}
            sub={`Delivery note: ${num(noted[p.k])}`}
            value={vals[p.k] ?? String(noted[p.k])}
            onChange={(v) => setVals((x) => ({ ...x, [p.k]: v }))}
            step={10}
          />
        ))}
      </Fields>
      {mismatch ? <Banner tone="warning" title="Counts don't match the delivery note" body="Say what happened so the district can follow up." /> : null}
      {mismatch ? (
        <Fields>
          <Input label="What happened?" value={issue} onChangeText={setIssue} ph="e.g. One carton was damaged" multiline />
        </Fields>
      ) : null}
      <Fields>
        <Check label="I signed the delivery note" value={signed} onChange={setSigned} />
      </Fields>
      <Btns>
        <Btn
          label="Confirm receipt"
          dis={!signed || (mismatch && !issue.trim())}
          onPress={() => send("confirmReceipt", { id: o.id, qty: got, issue: mismatch ? issue.trim() : "" }, `Confirm receipt · ${o.id}`)}
        />
      </Btns>
    </>
  );
}

export function OrderScreen({ id }: { id: string }) {
  const nav = useNav();
  const me = useMe();
  const { s } = useStore();
  const pend = usePending(id);
  const o = s.orders.find((x) => x.id === id);
  const backLabel = TAB_LABEL[nav.tab];
  if (!o) {
    return (
      <Screen title="Order" backLabel={backLabel}>
        <Banner tone="neutral" title="That order isn't available" body="It may belong to another hotspot." />
      </Screen>
    );
  }
  const you = me.role === "hm";
  const dl = o.delivery;
  const contact = s.hotspots.find((h) => h.id === o.hotspotId)?.contact ?? "The contact person";
  const lines = lineRows(dl?.lines ?? []);
  return (
    <Screen title={o.id} backLabel={backLabel}>
      <Hero title={o.hotspot} sub={`${o.id} · ${items(o.approved)}`} chip={orderChip(o.status)} steps={orderSteps(o, you)} msg={orderMsg(o, you, contact)} />
      {pend ? <Banner tone="warning" title="Saved on this phone" body={`${pend.label} sends when you are back online.`} /> : null}
      {you && o.status === "delivered" && !pend ? <ConfirmForm o={o} /> : null}
      {o.receipt?.issue ? <Banner tone="warning" title="Reported at receipt" body={o.receipt.issue} /> : null}
      {dl ? (
        <List h="Delivery">
          <Row t={dl.rider} s={`Rider · ${dl.plate}`} ic="phone" onPress={() => call(dl.phone)} />
          <Row t="Delivery note" v={dl.dn} />
          {dl.recipient ? <Row t="Received by" v={dl.recipient} /> : null}
        </List>
      ) : null}
      {lines.length ? (
        <List h="Batches">
          {lines.map((l) => (
            <Row key={l.batch} t={`${l.short} · ${l.batch}`} s={`Expires ${l.exp}`} v={num(l.qty)} />
          ))}
        </List>
      ) : null}
      {dl?.photo ? <PhotoField h="Signed delivery note" value={dl.photo} edit={false} when={`Photographed by ${dl.rider}`} /> : null}
      <List h="Request">
        <Row t="Requested" v={items(o.items)} />
        <Row t="Reason" v={o.reason || "—"} />
        <Row t="Raised by" v={o.by === me.name ? "You" : o.by} />
        {o.note ? <Row t="Note" v={o.note} /> : null}
      </List>
    </Screen>
  );
}
