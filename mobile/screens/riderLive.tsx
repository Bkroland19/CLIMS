import React, { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import Screen from "@/components/m/Screen";
import {
  Banner,
  Btn,
  Btns,
  Check,
  Done,
  Fields,
  Hero,
  List,
  Row,
  SkeletonList,
  Stepper,
} from "@/components/m/kit";
import { piecesOf, placeOf, type DeliveryLine, type RiderDelivery } from "@/lib/deliveries";
import { isNetworkError } from "@/lib/hotspots";
import { acknowledgeErrorMessage, acknowledgeStockout, toLocalOrder } from "@/lib/orders";
import { useMe } from "@/lib/session";
import { ago, chip, num, toInt } from "@/lib/format";
import { TAB_LABEL, useNav } from "@/lib/nav";
import { usePending, useStore } from "@/lib/store";
import { call } from "./common";

type Load = "loading" | "ok" | "offline" | "forbidden" | "error";

const TO_DELIVER = chip("To deliver", "info");
const CONFIRMED = chip("Confirmed", "neutral");

/**
 * The signed-in delivery agent's deliveries from GET /orders/deliveries, reloaded whenever the screen
 * is shown. Offline, the list last loaded on this phone stays on screen.
 */
function useMyDeliveries() {
  const { s, refreshDeliveries } = useStore();
  const [load, setLoad] = useState<Load>("loading");
  useFocusEffect(
    useCallback(() => {
      let live = true;
      refreshDeliveries().then((result) => live && setLoad(result));
      return () => {
        live = false;
      };
    }, [refreshDeliveries]),
  );
  // The store keeps the last list (saved on the phone), which the tab badge counts too.
  const list: RiderDelivery[] | null = s.riderDeliveries ?? null;
  return { list, load };
}

function LoadBanner({ load, any }: { load: Load; any: boolean }) {
  if (load === "forbidden")
    return (
      <Banner
        tone="warning"
        title="Your account can't see deliveries yet"
        body="Ask your district focal person to give your account the delivery agent role."
      />
    );
  if (load === "offline" && any)
    return <Banner tone="neutral" title="Offline" body="Showing your deliveries as last loaded." />;
  if (load === "offline")
    return <Banner tone="neutral" title="Offline" body="Connect to load your deliveries." />;
  if (load === "error")
    return (
      <Banner tone="warning" title="Couldn't load your deliveries" body="Try again shortly." />
    );
  return null;
}

/** Deliveries the hotspot has not confirmed yet, newest first. */
export function RiderDeliveriesLive() {
  const nav = useNav();
  const { list, load } = useMyDeliveries();
  const open = (list ?? []).filter((d) => !d.acknowledged);
  const [first, ...rest] = open;
  return (
    <Screen title="Deliveries" root>
      <LoadBanner load={load} any={list !== null} />
      {list === null && load === "loading" ? (
        <SkeletonList h="Next delivery" rows={3} />
      ) : first ? (
        <Hero
          h="Next delivery"
          title={first.hot_spot.name}
          sub={`${piecesOf(first)} · ${placeOf(first) || "Place not given"}`}
          chip={TO_DELIVER}
          msg={
            first.hot_spot.contact_name
              ? `Collect it at the district store, then hand it to ${first.hot_spot.contact_name}.`
              : "Collect it at the district store, then hand it to the hotspot's contact."
          }
        >
          <Btn
            label="Open delivery"
            icon="truck"
            onPress={() => nav.go(`assignment/${first.id}`)}
          />
        </Hero>
      ) : list !== null ? (
        <Done
          tone="neutral"
          icon="truck"
          title="No deliveries right now"
          body="You get a notification when the district names you for a delivery."
        />
      ) : null}
      {rest.length ? (
        <List h="Also assigned">
          {rest.map((d) => (
            <Row
              key={d.id}
              t={d.hot_spot.name}
              s={`${piecesOf(d)} · ${ago(Date.parse(d.created_at))}`}
              chip={TO_DELIVER}
              ic="truck"
              chev
              onPress={() => nav.go(`assignment/${d.id}`)}
            />
          ))}
        </List>
      ) : null}
    </Screen>
  );
}

/** Deliveries the hotspot has confirmed. */
export function RiderHistoryLive() {
  const nav = useNav();
  const { list, load } = useMyDeliveries();
  const done = (list ?? []).filter((d) => d.acknowledged);
  return (
    <Screen title="History" root>
      <LoadBanner load={load} any={list !== null} />
      {list === null && load === "loading" ? (
        <SkeletonList rows={4} />
      ) : (
        <List
          h="Confirmed by the hotspot"
          empty="Deliveries appear here once the hotspot confirms what arrived."
        >
          {done.map((d) => (
            <Row
              key={d.id}
              t={d.hot_spot.name}
              s={`${piecesOf(d)} · ${ago(Date.parse(d.created_at))}`}
              chip={CONFIRMED}
              ic="receipt"
              chev
              onPress={() => nav.go(`assignment/${d.id}`)}
            />
          ))}
        </List>
      )}
    </Screen>
  );
}

/**
 * The delivery agent's count of what the hotspot received, for when its manager cannot confirm it
 * (POST /orders/stockouts/{id}/acknowledgements). Counts can't be changed once CLIMS has them.
 */
function AgentAcknowledgeForm({
  d,
  lines,
  onDone,
}: {
  d: RiderDelivery;
  lines: DeliveryLine[];
  onDone: (queued: boolean) => void;
}) {
  const me = useMe();
  const { send, queue, offline, refreshDeliveries } = useStore();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const got = (l: DeliveryLine) => toInt(vals[l.id] ?? String(l.pieces));
  const short = lines.some((l) => got(l) !== l.pieces);
  const request = { lines: lines.map((l) => ({ line_id: l.id, pieces: got(l) })) };
  const label = `Confirm what arrived · ${d.hot_spot.name}`;

  const submit = async () => {
    setErr("");
    const saveForLater = () => {
      queue("acknowledge", { id: d.stockout_report_id, request, hotspot: d.hot_spot.name }, label);
      onDone(true);
    };
    if (offline) return saveForLater();
    setBusy(true);
    try {
      const next = await acknowledgeStockout(d.stockout_report_id, request);
      send("acknowledge", { order: toLocalOrder(next, me.name, "Delivery agent") }, label);
      await refreshDeliveries();
      onDone(false);
    } catch (e) {
      if (isNetworkError(e)) saveForLater();
      else setErr(acknowledgeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {err ? <Banner tone="danger" title="Couldn't confirm" body={err} /> : null}
      <Fields
        h="Confirm what the hotspot received"
        f="Only if the hotspot manager can't confirm it. Count single condoms (pieces); enter 0 for anything that didn't arrive."
      >
        {lines.map((l) => (
          <Stepper
            key={l.id}
            label={l.product}
            sub={`Sent ${num(l.pieces)} pieces`}
            value={vals[l.id] ?? String(l.pieces)}
            onChange={(v) => setVals((x) => ({ ...x, [l.id]: v }))}
            step={10}
          />
        ))}
      </Fields>
      {short ? (
        <Banner
          tone="warning"
          title="Counts differ from what was sent"
          body="The district sees both numbers and can follow up."
        />
      ) : null}
      <Fields>
        <Check
          label="I watched the stock handed over and counted it. These numbers can't be changed later."
          value={counted}
          onChange={setCounted}
        />
      </Fields>
      <Btns>
        <Btn
          label={
            busy ? "Confirming…" : offline ? "Save and send when online" : "Confirm what arrived"
          }
          dis={!counted || busy}
          onPress={submit}
        />
      </Btns>
    </>
  );
}

/** One delivery: where it goes, who to call, and what it carries. */
export function RiderAssignment({ id }: { id: string }) {
  const nav = useNav();
  const { list, load } = useMyDeliveries();
  const [confirmed, setConfirmed] = useState<"sent" | "queued" | null>(null);
  const d = list?.find((x) => x.id === id);
  // A count saved offline for this delivery's stockout, still waiting to send.
  const pend = usePending(d?.stockout_report_id);
  const backLabel = TAB_LABEL[nav.tab];
  if (!d)
    return (
      <Screen title="Delivery" backLabel={backLabel}>
        {list === null && load === "loading" ? (
          <SkeletonList rows={4} />
        ) : (
          <Banner
            tone="neutral"
            title="That delivery isn't available"
            body="It may have been assigned to someone else."
          />
        )}
      </Screen>
    );
  const phone = d.hot_spot.contact_phone?.trim();
  const waiting = d.lines.filter((l) => l.acknowledged_pieces === null);
  return (
    <Screen title="Delivery" backLabel={backLabel}>
      <Hero
        title={d.hot_spot.name}
        sub={`${placeOf(d) || "Place not given"} · assigned ${ago(Date.parse(d.created_at))}`}
        chip={d.acknowledged ? CONFIRMED : TO_DELIVER}
        msg={
          d.acknowledged
            ? "The hotspot confirmed what arrived. Nothing more is needed."
            : "Collect this at the district store and hand it to the hotspot's contact. The hotspot manager confirms what arrived in the app."
        }
      />
      {confirmed === "sent" ? (
        <Banner
          tone="success"
          title="Thanks, CLIMS has the count"
          body="The district is told you confirmed what the hotspot received."
        />
      ) : null}
      {pend || confirmed === "queued" ? (
        <Banner
          tone="warning"
          title="Saved on this phone"
          body="Your count sends when you are back online. You don't need to enter it again."
        />
      ) : null}
      <List h="Hand over to">
        <Row
          t={d.hot_spot.contact_name?.trim() || "The hotspot's contact"}
          s={phone || "No phone number on record"}
          ic="phone"
          onPress={phone ? () => call(phone) : undefined}
        />
      </List>
      <List h="What to carry">
        {d.lines.map((line) => (
          <Row
            key={line.id}
            t={line.product}
            s={
              line.acknowledged_pieces === null
                ? `${num(line.pieces)} pieces`
                : `${num(line.pieces)} sent · ${num(line.acknowledged_pieces)} received`
            }
            ic="pkg"
          />
        ))}
      </List>
      {d.note ? (
        <List h="Note from the district">
          <Row t={d.note} />
        </List>
      ) : null}
      {waiting.length && !pend && confirmed !== "queued" ? (
        <AgentAcknowledgeForm
          key={waiting.map((l) => l.id).join()}
          d={d}
          lines={waiting}
          onDone={(queued) => setConfirmed(queued ? "queued" : "sent")}
        />
      ) : null}
      {phone && !d.acknowledged ? (
        <Btns>
          <Btn
            label={`Call ${d.hot_spot.contact_name?.trim() || "the contact"}`}
            icon="phone"
            kind="secondary"
            onPress={() => call(phone)}
          />
        </Btns>
      ) : null}
    </Screen>
  );
}
