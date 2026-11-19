import React, { useRef, useState } from "react";
import type { ScrollViewInstance } from "react-native";
import * as Location from "expo-location";
import { useT } from "@/lib/theme";
import Screen from "@/components/m/Screen";
import {
  Banner, Btn, Btns, Check, Done, Fields, Hero, Input, List, Note, Pick, Progress, ReadOnly, Row, Search, Seg, Select, Sheet, Stepper, Toggle,
} from "@/components/m/kit";
import { MapCard, PhotoField } from "@/components/m/media";
import { ago, chip, items, orderChip, PRODUCTS, toInt } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { useMe } from "@/lib/session";
import { useStore } from "@/lib/store";
import type { Hotspot, Order, Qty } from "@/lib/types";
import { call, firstName, matches, stockStats } from "./common";

export function useMine() {
  const { s } = useStore();
  const me = useMe();
  const mine = s.hotspots.filter((h) => h.vhts.includes(me.name) || h.contact === me.name);
  const openOf = (hid: string): Order | undefined => s.orders.find((o) => o.hotspotId === hid && o.status !== "received");
  return { mine, openOf };
}

/* ───────── Hotspots tab ───────── */

export function VhtHotspots() {
  const T = useT();
  const nav = useNav();
  const { mine, openOf } = useMine();
  const [q, setQ] = useState("");
  const list = mine.filter((h) => matches(q, h.name, h.id, h.village, h.subcounty, h.contact));
  const areas = [...new Set(mine.map((h) => h.subcounty.replace(/ TC$/, "")))].join(" and ");
  return (
    <Screen title="Hotspots" root fab={{ label: "Map hotspot", icon: "plus", onPress: () => nav.go("map") }}>
      <Search value={q} onChangeText={setQ} ph="Search hotspots" />
      <List empty={`No hotspots match “${q}”.`} f={q ? "" : `${mine.length} hotspots in ${areas}`}>
        {list.map((h) => {
          const o = openOf(h.id);
          const out = h.stock.male === 0 || h.stock.female === 0;
          const left = items(h.stock);
          return (
            <Row
              key={h.id}
              t={h.name}
              s={`${h.village} · ${left === "—" ? "out of stock" : `${left} left`}`}
              ic="pin"
              icBg={h.status !== "Active" ? T.inactiveIcBg : out ? T.dangerIcBg : undefined}
              icFg={out && h.status === "Active" ? T.dangerIcFg : undefined}
              chip={h.status !== "Active" ? chip("Inactive", "neutral") : o ? orderChip(o.status) : null}
              chev
              onPress={() => nav.go(`hotspot/${h.id}`)}
            />
          );
        })}
      </List>
    </Screen>
  );
}

export function VhtHotspot({ id }: { id: string }) {
  const T = useT();
  const nav = useNav();
  const me = useMe();
  const { s } = useStore();
  const { mine, openOf } = useMine();
  const h = s.hotspots.find((x) => x.id === id) ?? mine[0];
  if (!h) return <Screen title="Hotspot" backLabel="Hotspots"><Banner tone="neutral" title="That hotspot isn't available" /></Screen>;
  const o = openOf(h.id);
  const active = h.status === "Active";
  const ords = s.orders.filter((x) => x.hotspotId === h.id).sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Screen title={h.name} backLabel="Hotspots">
      {h.lat != null ? (
        <MapCard lat={h.lat} lng={h.lng} cap={`${h.village}, ${h.subcounty}`} cap2={`GPS ${h.lat.toFixed(5)}, ${h.lng!.toFixed(5)}`} link={T.ios ? "Open in Maps" : "Directions"} />
      ) : null}
      <Hero
        title={h.name}
        sub={`${h.id} · ${h.kind} · ${h.subcounty}`}
        chip={chip(h.status, active ? "success" : "neutral")}
        stats={stockStats(T, h)}
        msg={`Last delivery ${h.lastDelivery != null ? ago(h.lastDelivery) : "none yet"}`}
      >
        {active ? <Btn label="Request stock" icon="megaphone" onPress={() => nav.go(`request/${h.id}`)} /> : null}
        {h.contact !== me.name ? <Btn label={`Call ${firstName(h.contact)}`} icon="phone" kind="secondary" onPress={() => call(h.phone)} /> : null}
      </Hero>
      {o ? (
        <Banner
          tone="info"
          title={`Open order ${o.id}`}
          body={`${orderChip(o.status).label} · ${items(o.approved)} · raised ${ago(o.createdAt)}`}
          act={{ label: "View order", onPress: () => nav.go(`order/${o.id}`) }}
        />
      ) : null}
      {!active ? <Banner tone="neutral" title="Inactive" body="Can't request stock until the district reactivates this hotspot." /> : null}
      <List h="Contact person">
        <Row t={h.contact} s={h.phone} ic="phone" v={h.contact === me.name ? "You" : ""} onPress={() => call(h.phone)} />
      </List>
      <List h="Details" f={h.comment}>
        <Row t="Type" v={h.kind} />
        <Row t="Dispenser" v={h.dispenser ? h.dispCond || "Yes" : "None"} />
        <Row t="VHTs" v={h.vhts.map((n) => (n === me.name ? "You" : n)).join(", ") || "—"} />
        <Row t="Mapped" v={h.mappedAt != null ? ago(h.mappedAt) : "—"} />
      </List>
      <List h="Past orders" empty="No orders yet.">
        {ords.map((x) => (
          <Row key={x.id} t={x.id} s={`${ago(x.createdAt)} · ${items(x.items)}`} chip={orderChip(x.status)} chev onPress={() => nav.go(`order/${x.id}`)} />
        ))}
      </List>
    </Screen>
  );
}

/* ───────── Requests tab ───────── */

export function VhtRequests() {
  const nav = useNav();
  const { s } = useStore();
  const { mine } = useMine();
  const ids = mine.map((h) => h.id);
  const rows = s.orders.filter((o) => ids.includes(o.hotspotId)).sort((a, b) => b.createdAt - a.createdAt);
  const q0 = s.outbox.filter((it) => it.type === "notify" && ids.includes(it.payload.hotspotId));
  return (
    <Screen title="Requests" root fab={{ label: "New request", icon: "plus", onPress: () => nav.go("request") }}>
      {q0.length ? (
        <List h="Waiting to send">
          {q0.map((it) => (
            <Row
              key={it.id}
              t={s.hotspots.find((h) => h.id === it.payload.hotspotId)?.name ?? it.payload.hotspotId}
              s={`${items(it.payload.items)} · saved ${ago(it.at)}`}
              chip={chip("Offline", "warning")}
              ic="upload"
            />
          ))}
        </List>
      ) : null}
      <List h={q0.length ? "Sent" : undefined} empty="No stock requests yet.">
        {rows.map((o) => (
          <Row key={o.id} t={o.hotspot} s={`${o.id} · ${items(o.items)} · ${ago(o.createdAt)}`} chip={orderChip(o.status)} chev onPress={() => nav.go(`order/${o.id}`)} />
        ))}
      </List>
    </Screen>
  );
}

/* ───────── Stock request (VHT on behalf of a hotspot, or the hotspot manager) ───────── */

export function RequestForm({ hotspotId, fixed }: { hotspotId?: string; fixed?: boolean }) {
  const nav = useNav();
  const me = useMe();
  const { s, send } = useStore();
  const { mine, openOf } = useMine();
  const isHm = me.role === "hm";
  const active = fixed ? s.hotspots.filter((h) => h.id === hotspotId) : mine.filter((h) => h.status === "Active");
  const [selId, setSel] = useState<string | undefined>(
    hotspotId && active.some((h) => h.id === hotspotId) ? hotspotId : active[0]?.id,
  );
  const sel = active.find((h) => h.id === selId);
  const [reason, setReason] = useState<"Out of stock" | "Running low">("Out of stock");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [pick, setPick] = useState(false);
  const [pq, setPq] = useState("");

  const left = {} as Qty;
  const need = {} as Qty;
  const val = (k: string, def: string) => vals[`${selId}:${k}`] ?? def;
  const set = (k: string) => (v: string) => setVals((x) => ({ ...x, [`${selId}:${k}`]: v }));
  PRODUCTS.forEach((p) => {
    left[p.k] = toInt(val(`l_${p.k}`, String(sel?.stock[p.k] ?? 0)));
    need[p.k] = toInt(val(`n_${p.k}`, p.k === "male" ? (isHm ? "2000" : "1000") : isHm ? "100" : "50"));
  });
  const open = selId ? openOf(selId) : undefined;

  const submit = () => {
    if (!sel) return;
    const r = send(
      "notify",
      { hotspotId: sel.id, items: need, remaining: left, reason, note: isHm ? note.trim() : `Raised by VHT on behalf of ${sel.contact}`, byRole: isHm ? "Hotspot manager" : "VHT" },
      isHm ? "Stockout notification" : `Stock request · ${sel.name}`,
    );
    if (isHm) {
      if (!r.queued && r.id) nav.replace(`order/${r.id}`);
      else {
        nav.back();
        nav.toTab("orders");
      }
    } else {
      nav.back();
      if (nav.tab !== "requests") nav.toTab("requests");
    }
  };

  return (
    <Screen title={isHm ? "Report stockout" : "Request stock"} backLabel={isHm ? "Home" : "Back"}>
      {!fixed ? (
        <Fields h="Hotspot">
          <Pick label="Hotspot" value={sel?.name ?? "Choose a hotspot"} sub={sel ? `${sel.contact} · ${sel.village}, ${sel.subcounty}` : ""} onPress={() => setPick(true)} />
          <Seg label="What's happening?" options={[["Out of stock", "Out of stock"], ["Running low", "Running low"]]} value={reason} onChange={setReason} />
        </Fields>
      ) : (
        <Fields f={reason === "Out of stock" ? "Nothing left in the dispenser or store." : "You will run out within a few days."}>
          <Seg label="What's happening?" options={[["Out of stock", "Out of stock"], ["Running low", "Running low"]]} value={reason} onChange={setReason} />
        </Fields>
      )}
      {open ? (
        <Banner
          tone="info"
          title={isHm ? "You already have an open order" : `${sel?.name} already has an open order`}
          body={`${open.id} is ${orderChip(open.status).label.toLowerCase()}.${isHm ? "" : " Only send another if more stock is needed."}`}
          act={isHm ? { label: "View order", onPress: () => nav.go(`order/${open.id}`) } : undefined}
        />
      ) : null}
      <Fields h={isHm ? "Left now" : "Left at the hotspot"} f={isHm ? undefined : "Count with the contact person if you are at the hotspot."}>
        {PRODUCTS.map((p) => (
          <Stepper key={p.k} label={`${p.short} condoms`} sub={p.brand} value={val(`l_${p.k}`, String(sel?.stock[p.k] ?? 0))} onChange={set(`l_${p.k}`)} step={p.k === "male" ? 50 : 10} />
        ))}
      </Fields>
      <Fields h="Quantity needed">
        {PRODUCTS.map((p) => (
          <Stepper key={p.k} label={`${p.short} condoms`} sub="Pieces" value={String(need[p.k])} onChange={set(`n_${p.k}`)} step={p.k === "male" ? 100 : 10} />
        ))}
      </Fields>
      {isHm ? (
        <Fields>
          <Input label="Note for the district (optional)" value={note} onChangeText={setNote} ph="e.g. Busy weekend coming" multiline />
        </Fields>
      ) : null}
      <Btns>
        <Btn label={isHm ? "Send to Wakiso district" : "Send stockout notification"} onPress={submit} dis={!sel || need.male + need.female === 0} />
      </Btns>
      <Note
        center
        text={
          isHm
            ? "The district reviews your notification and assigns a rider. You get a notification at each step."
            : `${sel?.contact ?? "The contact person"} is notified too and confirms receipt when the rider arrives.`
        }
      />
      {!fixed ? (
        <Sheet visible={pick} title="Choose hotspot" onClose={() => setPick(false)}>
          <Search value={pq} onChangeText={setPq} ph="Name, village or contact" />
          <List empty={`No hotspots match “${pq}”.`}>
            {active
              .filter((h) => matches(pq, h.name, h.id, h.village, h.subcounty, h.contact))
              .map((h) => (
                <Row
                  key={h.id}
                  t={h.name}
                  s={`${h.contact} · ${h.village}, ${h.subcounty}`}
                  ic={h.id === selId ? "check" : "pin"}
                  fw={h.id === selId ? "600" : "400"}
                  onPress={() => {
                    setSel(h.id);
                    setPq("");
                    setPick(false);
                  }}
                />
              ))}
          </List>
        </Sheet>
      ) : null}
    </Screen>
  );
}

/* ───────── Map a hotspot (4 steps) ───────── */

const SUBCOUNTIES = ["Katabi TC", "Kajjansi TC", "Nansana Municipality", "Kira Municipality", "Ssisa", "Busukuma"];
const STEPS = ["Location", "Details", "Contact person", "Review"];

export function VhtMapDone({ id }: { id: string }) {
  const nav = useNav();
  const me = useMe();
  const { s } = useStore();
  const h = s.hotspots.find((x) => x.id === id);
  if (!h) return <Screen title="Hotspot mapped" backLabel="Hotspots"><Banner tone="neutral" title="That hotspot isn't available" /></Screen>;
  return (
    <Screen title="Hotspot mapped" backLabel="Hotspots">
      <Done
        title={`${h.name} is active`}
        body={`${h.id} is on the Wakiso hotspot register. ${h.contact === me.name ? "You are its contact person." : `${h.contact} gets an SMS with their CLIMS username.`}`}
      />
      <Btns>
        <Btn label="Request first stock" onPress={() => nav.replace(`request/${h.id}`)} />
        <Btn label="Map another hotspot" kind="secondary" onPress={() => nav.replace("map")} />
        <Btn label="Back to hotspots" kind="text" onPress={nav.back} />
      </Btns>
    </Screen>
  );
}

export function VhtMap() {
  const nav = useNav();
  const me = useMe();
  const { send } = useStore();
  const scroll = useRef<ScrollViewInstance>(null);
  const [step, setStep] = useState(0);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsWait, setGpsWait] = useState(false);
  const [gpsErr, setGpsErr] = useState("");
  const [f, setF] = useState({
    village: "", subcounty: "Katabi TC", name: "", kind: "Permanent" as Hotspot["kind"], disp: "Working", comment: "",
    who: "other" as "other" | "me", cname: "", cphone: "", invite: true, visited: false,
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const up = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const capture = async () => {
    setGpsErr("");
    setGpsWait(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setGpsErr("Allow location access in Settings to capture the hotspot's GPS.");
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGps({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy ?? 0) });
    } catch {
      setGpsErr("Couldn't get a GPS fix. Move into the open and try again.");
    } finally {
      setGpsWait(false);
    }
  };

  const phoneOk = /^\+?[0-9 ()-]{7,20}$/.test(f.cphone.trim());
  const valid = [
    gps != null && f.village.trim().length > 1,
    f.name.trim().length > 2,
    f.who === "me" || (f.cname.trim().length > 2 && phoneOk),
    f.visited,
  ];
  const contact = f.who === "me" ? me.name : f.cname.trim();

  const next = () => {
    if (step < 3) {
      setStep(step + 1);
      scroll.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const r = send(
      "mapHotspot",
      {
        hotspot: {
          name: f.name.trim(), kind: f.kind, village: f.village.trim(), subcounty: f.subcounty, contact,
          phone: f.who === "me" ? me.phone : f.cphone.trim(), vhts: [me.name], dispenser: f.disp !== "None",
          dispCond: f.disp === "None" ? "" : f.disp, lat: gps?.lat, lng: gps?.lng, comment: f.comment.trim(), dispPhoto: photo ?? undefined,
        },
      },
      `Map hotspot · ${f.name.trim()}`,
    );
    if (!r.queued && r.id) nav.replace(`map/${r.id}`);
    else nav.back();
  };

  return (
    <Screen title="Map a hotspot" backLabel="Hotspots" scrollRef={scroll}>
      <Progress count={4} step={step} label={`Step ${step + 1} of 4 · ${STEPS[step]}`} />
      {step === 0 ? (
        <>
          {gpsWait ? (
            <MapCard h="Where is the hotspot?" cap="Capturing GPS…" wait />
          ) : gps ? (
            <MapCard
              h="Where is the hotspot?"
              lat={gps.lat}
              lng={gps.lng}
              cap="Location captured"
              cap2={`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} · accuracy ±${gps.acc} m`}
              act={{ label: "Capture again", onPress: capture }}
            />
          ) : (
            <>
              <Banner
                h="Where is the hotspot?"
                tone={gpsErr ? "warning" : "info"}
                title={gpsErr ? "No location yet" : "Stand at the hotspot entrance"}
                body={gpsErr || "Then capture the GPS location. It works without network."}
              />
              <Btns>
                <Btn label="Capture GPS location" icon="gps" kind="secondary" onPress={capture} />
              </Btns>
            </>
          )}
          <Fields h="Address">
            <Input label="Village" value={f.village} onChangeText={up("village")} ph="e.g. Kigungu" autoCapitalize="words" />
            <Select label="Sub-county" value={f.subcounty} options={SUBCOUNTIES.map((x) => ({ v: x, l: x }))} onChange={up("subcounty")} />
            <ReadOnly label="District" value="Wakiso" />
          </Fields>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <Fields h="About the hotspot" f={f.kind === "Permanent" ? "Bars, lodges, landing sites, taxi parks." : "Markets, events and seasonal sites."}>
            <Input label="Hotspot name" value={f.name} onChangeText={up("name")} ph="Name people in the area use" autoCapitalize="words" />
            <Seg label="Type" options={[["Permanent", "Permanent"], ["Temporary", "Temporary"]]} value={f.kind} onChange={up("kind")} />
            <Select
              label="Condom dispenser"
              value={f.disp}
              onChange={up("disp")}
              options={[["Working", "Yes — working"], ["Needs repair", "Yes — needs repair"], ["Broken", "Yes — broken"], ["None", "No dispenser"]].map(([v, l]) => ({ v, l }))}
            />
          </Fields>
          {f.disp !== "None" ? (
            <PhotoField h="Dispenser photo" value={photo} onChange={setPhoto} hint="Photograph the dispenser so the district can see its condition." when="Taken just now" />
          ) : null}
          <Fields>
            <Input label="Comment (optional)" value={f.comment} onChangeText={up("comment")} ph="e.g. Busy on weekends" multiline />
          </Fields>
        </>
      ) : null}
      {step === 2 ? (
        <Fields h="Contact person" f={f.who === "me" ? "You receive deliveries and report stockouts for this hotspot." : "The contact person receives deliveries and reports stockouts."}>
          <Seg label="Who receives deliveries?" options={[["other", "Someone there"], ["me", "Me"]]} value={f.who} onChange={up("who")} />
          {f.who === "other" ? <Input label="Full name" value={f.cname} onChangeText={up("cname")} ph="e.g. Sarah Nakirya" autoCapitalize="words" /> : null}
          {f.who === "other" ? (
            <Input
              label="Phone number"
              value={f.cphone}
              onChangeText={up("cphone")}
              keyboardType="phone-pad"
              ph="+256 7XX XXX XXX"
              err={f.cphone.trim() && !phoneOk ? "Enter a phone number, e.g. +256 700 000000." : ""}
            />
          ) : null}
          {f.who === "other" ? (
            <Toggle label="Invite as hotspot manager" sub="They get an SMS with their username and password" value={f.invite} onChange={up("invite")} />
          ) : null}
        </Fields>
      ) : null}
      {step === 3 ? (
        <>
          <List h="Review">
            <Row t="Name" v={f.name} />
            <Row t="Type" v={f.kind} />
            <Row t="Location" v={`${f.village}, ${f.subcounty}`} />
            <Row t="GPS" v={gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "—"} />
            <Row t="Dispenser" v={f.disp === "None" ? "None" : `${f.disp}${photo ? " · photo" : ""}`} />
            <Row t="Contact" v={f.who === "me" ? "You" : `${contact} · ${f.cphone}`} />
          </List>
          <Fields>
            <Check label="I visited this hotspot and the details are correct" value={f.visited} onChange={up("visited")} />
          </Fields>
        </>
      ) : null}
      <Btns>
        <Btn label={step === 3 ? "Activate hotspot" : "Continue"} onPress={next} dis={!valid[step]} />
        {step > 0 ? <Btn label="Back" kind="text" onPress={() => setStep(step - 1)} /> : null}
      </Btns>
    </Screen>
  );
}
