import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { items as fmtItems } from "./format";
import { createSeed, DEFAULT_PERSONAS, HM_HOTSPOT } from "./seed";
import { useMe } from "./session";
import type {
  ActionType,
  AppEvent,
  AppRole,
  DomainState,
  EventRole,
  Hotspot,
  OutboxItem,
  Qty,
  ReportError,
  ReportValues,
} from "./types";

/**
 * Offline-first store for the field app.
 *
 * Every write goes through `send`. Online, it applies straight away; offline, it is saved to the
 * outbox and applied when the phone reconnects. Today "applying" updates the local copy only,
 * because the API has no domain endpoints yet. When they land, `apply` becomes the place that
 * calls them, and the outbox already gives you retry-on-reconnect.
 */

export interface SendResult {
  queued: boolean;
  /** ID of a created record (new order or hotspot) when sent online. */
  id?: string;
}

interface StoreCtx {
  s: DomainState;
  ready: boolean;
  offline: boolean;
  send: (type: ActionType, payload: any, label: string) => SendResult;
  /** Record validation errors on a report. Local only, never queued. */
  reportErrors: (id: string, values: ReportValues, errors: ReportError[]) => void;
  markRead: (role: AppRole) => void;
  reset: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

const roleOfEvent: Record<string, EventRole> = { VHT: "VHT", "Hotspot manager": "Hotspot manager" };

type Applied = { next: DomainState; id?: string };

function apply(s: DomainState, type: ActionType, p: any, role: AppRole, me: string, now: number): Applied {
  const ev = (e: Omit<AppEvent, "id" | "t">): AppEvent => ({ id: `EV-${now}-${Math.random().toString(36).slice(2, 7)}`, t: now, ...e });
  const setOrder = (id: string, f: (o: DomainState["orders"][number]) => DomainState["orders"][number]) =>
    s.orders.map((o) => (o.id === id ? f(o) : o));
  const setHotspot = (id: string, f: (h: Hotspot) => Hotspot) => s.hotspots.map((h) => (h.id === id ? f(h) : h));

  switch (type) {
    case "notify": {
      const seq = s.seq + 1;
      const id = `ORD-${seq}`;
      const h = s.hotspots.find((x) => x.id === p.hotspotId);
      if (!h) return { next: s };
      const items: Qty = p.items;
      const order = {
        id, hotspotId: h.id, hotspot: h.name, status: "queued" as const, items, approved: items,
        remaining: p.remaining, reason: p.reason, note: p.note || "", by: me, byRole: p.byRole, createdAt: now,
      };
      const to: AppRole[] = role === "vht" ? (h.id === HM_HOTSPOT ? ["hm"] : []) : ["vht"];
      const events = to.length
        ? [ev({ ref: id, role: roleOfEvent[p.byRole] ?? "System", actor: me, text: `${p.reason} at ${h.name} · asked for ${fmtItems(items)}`, to }), ...s.events]
        : s.events;
      return {
        id,
        next: { ...s, seq, orders: [order, ...s.orders], hotspots: setHotspot(h.id, (x) => ({ ...x, stock: p.remaining })), events },
      };
    }
    case "mapHotspot": {
      const nums = s.hotspots.map((h) => parseInt(h.id.replace(/\D/g, ""), 10) || 0);
      const id = `HS-${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
      const h: Hotspot = { ...p.hotspot, id, district: "Wakiso", status: "Active", stock: { male: 0, female: 0 }, mappedAt: now };
      return { id, next: { ...s, hotspots: [h, ...s.hotspots] } };
    }
    case "confirmReceipt": {
      const o = s.orders.find((x) => x.id === p.id);
      if (!o) return { next: s };
      const qty: Qty = p.qty;
      return {
        next: {
          ...s,
          orders: setOrder(o.id, (x) => ({ ...x, status: "received", receipt: { at: now, qty, issue: p.issue || "", by: me } })),
          hotspots: setHotspot(o.hotspotId, (h) => ({ ...h, stock: { male: h.stock.male + qty.male, female: h.stock.female + qty.female }, lastDelivery: now })),
          events: [
            ev({ ref: o.id, role: "Hotspot manager", actor: me, text: `Confirmed receipt at ${o.hotspot} · ${p.issue ? `reported: ${p.issue}` : "counts matched"}`, to: ["rider", "vht"] }),
            ...s.events,
          ],
        },
      };
    }
    case "pickup": {
      const o = s.orders.find((x) => x.id === p.id);
      if (!o?.delivery) return { next: s };
      return {
        next: {
          ...s,
          orders: setOrder(o.id, (x) => ({ ...x, status: "in_transit", delivery: { ...x.delivery!, pickedAt: now } })),
          events: [ev({ ref: o.id, role: "Rider", actor: me, text: "Collected the stock at the district store and is on the way", to: ["hm", "vht"] }), ...s.events],
        },
      };
    }
    case "deliver": {
      const o = s.orders.find((x) => x.id === p.id);
      if (!o?.delivery) return { next: s };
      return {
        next: {
          ...s,
          orders: setOrder(o.id, (x) => ({
            ...x,
            status: "delivered",
            delivery: { ...x.delivery!, deliveredAt: now, qty: p.qty, found: p.found, recipient: p.recipient, photo: p.photo, sig: p.sig },
          })),
          hotspots: setHotspot(o.hotspotId, (h) => ({ ...h, stock: p.found })),
          events: [ev({ ref: o.id, role: "Rider", actor: me, text: `Delivered to ${o.hotspot}. ${p.recipient} needs to confirm receipt`, to: ["hm", "vht"] }), ...s.events],
        },
      };
    }
    case "rptSave":
      return { next: { ...s, reports: s.reports.map((r) => (r.id === p.id ? { ...r, values: p.values, savedAt: now } : r)) } };
    case "rptSend": {
      const r = s.reports.find((x) => x.id === p.id);
      if (!r) return { next: s };
      const receipt = `MOH-${String(new Date(now).getFullYear()).slice(2)}${String(new Date(now).getMonth() + 1).padStart(2, "0")}-${String(now % 10000).padStart(4, "0")}`;
      return {
        next: {
          ...s,
          reports: s.reports.map((x) =>
            x.id === p.id
              ? { ...x, values: p.values, status: "sent", errors: [], runs: x.runs + 1, savedAt: now, sentAt: now, receipt, reporter: me }
              : x,
          ),
          events: [ev({ ref: r.id, role: "MOH", actor: "Ministry of Health", text: "Received your monthly report", to: [r.own] }), ...s.events],
        },
      };
    }
  }
  return { next: s };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const key = `clims.domain.v1.${me.id}`;
  const personas = useMemo(() => ({ ...DEFAULT_PERSONAS, [me.role]: me.name }), [me.role, me.name]);
  const [s, setS] = useState<DomainState>(() => createSeed(personas));
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  // Latest state for callbacks; `commit` is the only writer, so it never lags behind `s`.
  const ref = useRef(s);

  const commit = useCallback((next: DomainState) => {
    ref.current = next;
    setS(next);
  }, []);

  // Load this user's saved copy, or start from the seed.
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!live) return;
        if (raw) commit(JSON.parse(raw));
        else commit(createSeed(personas));
      })
      .catch(() => {})
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [key, personas, commit]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(key, JSON.stringify(s)).catch(() => {});
  }, [s, key, ready]);

  const flush = useCallback(() => {
    const cur = ref.current;
    if (!cur.outbox.length) return;
    let next: DomainState = { ...cur, outbox: [] };
    for (const it of cur.outbox) next = apply(next, it.type, it.payload, it.role, me.name, Date.now()).next;
    commit(next);
  }, [commit, me.name]);

  useEffect(
    () =>
      NetInfo.addEventListener((n) => {
        const off = n.isConnected === false;
        setOffline(off);
        if (!off) flush();
      }),
    [flush],
  );

  const send = useCallback(
    (type: ActionType, payload: any, label: string): SendResult => {
      const cur = ref.current;
      if (offline) {
        const item: OutboxItem = { id: `OB-${Date.now()}`, type, payload, label, role: me.role, at: Date.now() };
        commit({ ...cur, outbox: [...cur.outbox, item] });
        return { queued: true };
      }
      const { next, id } = apply(cur, type, payload, me.role, me.name, Date.now());
      commit(next);
      return { queued: false, id };
    },
    [offline, commit, me.role, me.name],
  );

  const reportErrors = useCallback(
    (id: string, values: ReportValues, errors: ReportError[]) => {
      const cur = ref.current;
      commit({
        ...cur,
        reports: cur.reports.map((r) => (r.id === id ? { ...r, values, errors, status: "errors", runs: r.runs + 1, savedAt: Date.now() } : r)),
      });
    },
    [commit],
  );

  const markRead = useCallback(
    (role: AppRole) => {
      const cur = ref.current;
      commit({ ...cur, read: { ...cur.read, [role]: Date.now() } });
    },
    [commit],
  );

  const reset = useCallback(() => commit(createSeed(personas)), [commit, personas]);

  const value = useMemo(
    () => ({ s, ready, offline, send, reportErrors, markRead, reset }),
    [s, ready, offline, send, reportErrors, markRead, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside StoreProvider");
  return c;
}

/** Notifications for the signed-in role, newest first. */
export function useNotes() {
  const { s } = useStore();
  const me = useMe();
  return useMemo(
    () => s.events.filter((e) => e.to.includes(me.role) && e.actor !== me.name).sort((a, b) => b.t - a.t),
    [s.events, me.role, me.name],
  );
}

/** Unread notifications for the signed-in role. */
export function useUnread() {
  const { s } = useStore();
  const me = useMe();
  const notes = useNotes();
  const read = s.read[me.role] ?? 0;
  return notes.filter((e) => e.t > read).length;
}

/** The outbox entry still waiting for this record, if any. */
export function usePending(id?: string) {
  const { s } = useStore();
  return id ? s.outbox.find((it) => it.payload?.id === id || it.payload?.hotspotId === id) : undefined;
}
