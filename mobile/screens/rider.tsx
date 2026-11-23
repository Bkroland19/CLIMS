import React, { useState } from "react";
import { Share } from "react-native";
import { useT } from "@/lib/theme";
import Screen from "@/components/m/Screen";
import {
  Banner,
  Btn,
  Btns,
  Check,
  Done,
  Fields,
  Hero,
  Input,
  List,
  Row,
  Stepper,
  type StepItem,
} from "@/components/m/kit";
import { MapCard, PhotoField, SignaturePad } from "@/components/m/media";
import { ago, chip, type ChipDef, items, lineRows, num, PRODUCTS, toInt } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { RIDER } from "@/lib/seed";
import { useMe } from "@/lib/session";
import { usePending, useStore } from "@/lib/store";
import type { Order, OrderStatus, Qty } from "@/lib/types";
import { call } from "./common";
import { RiderDeliveriesLive, RiderHistoryLive } from "./riderLive";

const RC: Partial<Record<OrderStatus, ChipDef>> = {
  dispatched: chip("To collect", "info"),
  in_transit: chip("On the way", "info"),
  delivered: chip("Awaiting confirmation", "success"),
  received: chip("Confirmed", "neutral"),
};

/** A signed-in delivery agent sees the deliveries the API names for them; demo sign-ins, samples. */
export function RiderDeliveries() {
  return useMe().demo ? <RiderDeliveriesSample /> : <RiderDeliveriesLive />;
}

export function RiderHistory() {
  return useMe().demo ? <RiderHistorySample /> : <RiderHistoryLive />;
}

function useRider() {
  const { s } = useStore();
  const mine = s.orders.filter((o) => o.delivery?.riderId === RIDER.id);
  const H = (hid: string) => s.hotspots.find((h) => h.id === hid);
  return { mine, H };
}

function RiderDeliveriesSample() {
  const nav = useNav();
  const { mine, H } = useRider();
  const actv = mine
    .filter((o) => o.status === "dispatched" || o.status === "in_transit")
    .sort((a, b) => b.delivery!.at - a.delivery!.at);
  const first = actv[0];
  const fh = first ? H(first.hotspotId) : undefined;
  return (
    <Screen title="Deliveries" root>
      {first ? (
        <Hero
          h="Next delivery"
          title={first.hotspot}
          sub={`${first.delivery!.dn} · ${items(first.approved)} · ${fh?.village ?? ""}`}
          chip={RC[first.status]}
          msg={
            first.status === "dispatched"
              ? "Collect the stock and delivery note at the Wakiso district store."
              : `Ride to ${fh?.village} and hand over to ${fh?.contact}.`
          }
        >
          <Btn
            label={first.status === "dispatched" ? "Start collection" : "Continue delivery"}
            onPress={() => nav.go(`delivery/${first.id}`)}
          />
        </Hero>
      ) : (
        <Done
          tone="neutral"
          icon="truck"
          title="No deliveries right now"
          body="You get a notification when the district assigns you a delivery."
        />
      )}
      {actv.length > 1 ? (
        <List h="Also assigned">
          {actv.slice(1).map((o) => (
            <Row
              key={o.id}
              t={o.hotspot}
              s={`${o.delivery!.dn} · ${items(o.approved)}`}
              chip={RC[o.status]}
              ic="truck"
              chev
              onPress={() => nav.go(`delivery/${o.id}`)}
            />
          ))}
        </List>
      ) : null}
    </Screen>
  );
}

function RiderHistorySample() {
  const nav = useNav();
  const { mine } = useRider();
  const done = mine
    .filter((o) => o.status === "delivered" || o.status === "received")
    .sort((a, b) => (b.delivery!.deliveredAt ?? 0) - (a.delivery!.deliveredAt ?? 0));
  return (
    <Screen title="History" root>
      <List h="Receipts" empty="Deliveries you hand over appear here with their receipts.">
        {done.map((o) => (
          <Row
            key={o.id}
            t={o.hotspot}
            s={`${o.delivery!.dn} · ${items(o.delivery!.qty ?? o.approved)} · ${ago(o.delivery!.deliveredAt)}`}
            chip={RC[o.status]}
            ic="receipt"
            chev
            onPress={() => nav.go(`receipt/${o.id}`)}
          />
        ))}
      </List>
    </Screen>
  );
}

function Collect({ o }: { o: Order }) {
  const { send } = useStore();
  const [d, setD] = useState<Record<string, boolean>>({});
  const dl = o.delivery!;
  const alloc = lineRows(dl.lines);
  const list: [string, string, string][] = [
    ["dn", `Delivery note ${dl.dn}`, "Two copies — one stays signed at the hotspot"],
    ...PRODUCTS.filter((p) => o.approved[p.k] > 0).map((p): [string, string, string] => [
      p.k,
      `${p.name} · ${num(o.approved[p.k])}`,
      alloc
        .filter((a) => a.k === p.k)
        .map((a) => `${a.batch} (exp ${a.exp})`)
        .join(", ") || p.brand,
    ]),
  ];
  return (
    <>
      <Fields h="Before you leave the store" f="Tick each item as you load it.">
        {list.map(([k, t, sub]) => (
          <Check
            key={k}
            label={t}
            sub={sub}
            value={!!d[k]}
            onChange={(v) => setD((x) => ({ ...x, [k]: v }))}
          />
        ))}
      </Fields>
      <Btns>
        <Btn
          label="Start trip"
          icon="truck"
          dis={!list.every(([k]) => d[k])}
          onPress={() => send("pickup", { id: o.id }, `Start trip · ${dl.dn}`)}
        />
      </Btns>
    </>
  );
}

function Handover({ o, contact }: { o: Order; contact: string }) {
  const { send } = useStore();
  const dl = o.delivery!;
  const lines = PRODUCTS.filter((p) => o.approved[p.k] > 0);
  const [v, setV] = useState<Record<string, string>>({});
  const [recipient, setRecipient] = useState(contact);
  const [sig, setSig] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const qty = { male: 0, female: 0 } as Qty;
  const found = { male: 0, female: 0 } as Qty;
  let missing = false;
  lines.forEach((p) => {
    qty[p.k] = toInt(v[`q_${p.k}`] ?? String(o.approved[p.k]));
    const f = v[`f_${p.k}`] ?? "";
    found[p.k] = toInt(f);
    if (f.trim() === "") missing = true;
  });
  const set = (k: string) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  return (
    <>
      <Fields h="Handed over">
        {lines.map((p) => (
          <Stepper
            key={p.k}
            label={p.name}
            sub={`Note says ${num(o.approved[p.k])}`}
            value={v[`q_${p.k}`] ?? String(o.approved[p.k])}
            onChange={set(`q_${p.k}`)}
            step={10}
          />
        ))}
      </Fields>
      <Fields h="Already at the hotspot" f="Enter 0 if there was nothing left.">
        {lines.map((p) => (
          <Stepper
            key={p.k}
            label={p.name}
            sub="Count before you hand over"
            value={v[`f_${p.k}`] ?? ""}
            onChange={set(`f_${p.k}`)}
            step={10}
          />
        ))}
      </Fields>
      <Fields h="Received by">
        <Input label="Name" value={recipient} onChangeText={setRecipient} autoCapitalize="words" />
      </Fields>
      <SignaturePad who={`Signed by ${recipient || "…"}`} value={sig} onChange={setSig} />
      <PhotoField
        h="Signed delivery note"
        value={photo}
        onChange={setPhoto}
        hint="Photograph the delivery note after it is signed."
        when="Taken just now on this phone"
      />
      <Btns>
        <Btn
          label="Confirm handover"
          dis={!photo || !sig || !recipient.trim() || missing}
          onPress={() =>
            send(
              "deliver",
              { id: o.id, qty, found, recipient: recipient.trim(), photo, sig },
              `Delivery · ${dl.dn}`,
            )
          }
        />
      </Btns>
    </>
  );
}

export function RiderDelivery({ id }: { id: string }) {
  const T = useT();
  const nav = useNav();
  const { mine, H } = useRider();
  const pend = usePending(id);
  const o = mine.find((x) => x.id === id);
  if (!o)
    return (
      <Screen title="Delivery" backLabel="Deliveries">
        <Banner
          tone="neutral"
          title="That delivery isn't available"
          body="It may have been reassigned."
        />
      </Screen>
    );
  const h = H(o.hotspotId);
  const st = o.status;
  const dl = o.delivery!;
  const steps: StepItem[] = [
    {
      label: "Collect stock",
      st: st === "dispatched" ? "cur" : "done",
      sub: dl.pickedAt != null ? ago(dl.pickedAt) : "Wakiso district store",
    },
    {
      label: "Ride to hotspot",
      st: st === "in_transit" ? "cur" : st === "dispatched" ? "todo" : "done",
      sub: h?.village,
    },
    {
      label: "Hand over",
      st: st === "in_transit" ? "cur" : st === "dispatched" ? "todo" : "done",
      sub: dl.deliveredAt != null ? ago(dl.deliveredAt) : "Signature and photo",
    },
    {
      label: "Hotspot confirms",
      st: st === "received" ? "done" : st === "delivered" ? "cur" : "todo",
      sub: o.receipt ? ago(o.receipt.at) : "",
    },
  ];
  const done = st === "delivered" || st === "received";
  return (
    <Screen title={dl.dn} backLabel="Deliveries">
      <Hero title={o.hotspot} sub={`${dl.dn} · ${items(o.approved)}`} chip={RC[st]} steps={steps} />
      {pend ? (
        <Banner
          tone="warning"
          title="Saved on this phone"
          body={`${pend.label} sends when you are back online.`}
        />
      ) : null}
      {done ? (
        <Banner
          tone={st === "received" ? "success" : "info"}
          title={
            st === "received" ? `Confirmed by ${h?.contact}` : `Delivered ${ago(dl.deliveredAt)}`
          }
          body={
            st === "received"
              ? "This delivery is closed."
              : `${h?.contact} has been asked to confirm receipt.`
          }
          act={{ label: "View receipt", onPress: () => nav.go(`receipt/${o.id}`) }}
        />
      ) : null}
      {!done && h?.lat != null ? (
        <MapCard
          h="Drop-off"
          lat={h.lat}
          lng={h.lng}
          cap={h.name}
          cap2={`${h.village}, ${h.subcounty}`}
          link={T.ios ? "Open in Maps" : "Directions"}
        />
      ) : null}
      {!done && h ? (
        <List>
          <Row
            t={h.contact}
            s={`Contact person · ${h.phone}`}
            ic="phone"
            onPress={() => call(h.phone)}
          />
        </List>
      ) : null}
      {st === "dispatched" && !pend ? <Collect o={o} /> : null}
      {st === "in_transit" && !pend ? <Handover o={o} contact={h?.contact ?? ""} /> : null}
      <List h="Load">
        {lineRows(dl.lines).map((a) => (
          <Row key={a.batch} t={`${a.short} · ${a.batch}`} s={`Expires ${a.exp}`} v={num(a.qty)} />
        ))}
      </List>
    </Screen>
  );
}

export function RiderReceipt({ id }: { id: string }) {
  const { mine, H } = useRider();
  const o = mine.find((x) => x.id === id);
  if (!o?.delivery?.deliveredAt)
    return (
      <Screen title="Receipt" backLabel="History">
        <Banner tone="neutral" title="No receipt yet" body="Receipts appear after the handover." />
      </Screen>
    );
  const h = H(o.hotspotId);
  const dl = o.delivery;
  const st = o.status;
  const handed = dl.qty ?? o.approved;
  const share = () =>
    Share.share({
      message: [
        `CLIMS delivery receipt · ${dl.dn}`,
        `${o.hotspot} · ${ago(dl.deliveredAt)}`,
        `Handed over: ${items(handed)}`,
        dl.found
          ? `Already at the hotspot: ${items(dl.found) === "—" ? "None" : items(dl.found)}`
          : "",
        `Received by: ${dl.recipient ?? "—"}`,
        `Rider: ${dl.rider} · ${dl.plate}`,
      ]
        .filter(Boolean)
        .join("\n"),
    }).catch(() => {});
  return (
    <Screen title="Receipt" backLabel="History">
      <Hero
        title={`Delivery note ${dl.dn}`}
        sub={`${o.hotspot} · ${ago(dl.deliveredAt)}`}
        chip={RC[st]}
      />
      <List h="Handed over">
        {PRODUCTS.filter((p) => handed[p.k] > 0).map((p) => (
          <Row key={p.k} t={p.name} v={num(handed[p.k])} />
        ))}
        {dl.found ? (
          <Row t="Already at the hotspot" v={items(dl.found) === "—" ? "None" : items(dl.found)} />
        ) : null}
      </List>
      <List h="Batches">
        {lineRows(dl.lines).map((a) => (
          <Row key={a.batch} t={`${a.short} · ${a.batch}`} s={`Expires ${a.exp}`} v={num(a.qty)} />
        ))}
      </List>
      <List h="Handover">
        <Row t="Received by" v={dl.recipient || "—"} />
        {dl.sig ? <Row t="Signature" sig={dl.sig} /> : <Row t="Signature" v="On the paper note" />}
      </List>
      {dl.photo ? (
        <PhotoField
          h="Signed delivery note"
          value={dl.photo}
          edit={false}
          when="Photographed at handover"
        />
      ) : null}
      <Banner
        tone={st === "received" ? "success" : "info"}
        title={
          st === "received"
            ? `Confirmed by ${h?.contact} ${ago(o.receipt?.at)}`
            : `Waiting for ${h?.contact} to confirm`
        }
        body={
          st === "received"
            ? o.receipt?.issue
              ? `Reported: ${o.receipt.issue}`
              : "Counts matched."
            : "You will be notified when the hotspot confirms."
        }
      />
      <Btns>
        <Btn label="Share receipt" icon="receipt" kind="secondary" onPress={share} />
      </Btns>
    </Screen>
  );
}
