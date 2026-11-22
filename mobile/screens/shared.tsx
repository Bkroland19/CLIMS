import React, { useCallback, useState } from "react";
import { Platform, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useT, useTheme, type ThemeMode } from "@/lib/theme";
import Screen from "@/components/m/Screen";
import { Avatar, Fields, List, Row, Section, Seg, Sheet, Toggle, Txt } from "@/components/m/kit";
import type { IconName } from "@/components/m/Icon";
import { ago, initials } from "@/lib/format";
import { TAB_LABEL, useNav } from "@/lib/nav";
import { DCFP, HM_HOTSPOT, RIDER } from "@/lib/seed";
import { ROLE_LABEL, useMe, useSession } from "@/lib/session";
import { useNotes, useStore } from "@/lib/store";
import type { AppEvent } from "@/lib/types";
import { call } from "./common";
import { TYPE } from "@/lib/fonts";

const ORG: Record<string, (e: AppEvent) => string> = {
  DCFP: () => `${DCFP.district} district`,
  Rider: (e) => `${e.actor} · rider`,
  MOH: () => "Ministry of Health",
  NMS: () => "National Medical Stores",
  JMS: () => "Joint Medical Store",
  System: () => "CLIMS",
};
export const orgOf = (e: AppEvent) => (ORG[e.role] ? ORG[e.role](e) : e.actor);

const NOTE_IC: Record<string, IconName> = {
  DCFP: "building",
  Rider: "truck",
  MOH: "shield",
  "Hotspot manager": "pin",
  VHT: "user",
  System: "info",
};

export function useOpenNote() {
  const nav = useNav();
  const me = useMe();
  return useCallback(
    (e: AppEvent) => {
      if (e.ref.startsWith("MAP-")) return nav.go("map");
      if (e.ref.startsWith("REQ-")) return nav.go("request");
      if (me.role === "rider") return nav.go(`delivery/${e.ref}`);
      return nav.go(`order/${e.ref}`);
    },
    [nav, me.role],
  );
}

export function Inbox() {
  const nav = useNav();
  const me = useMe();
  const { s, markRead } = useStore();
  const notes = useNotes().slice(0, 30);
  const open = useOpenNote();
  const [rd] = useState(() => s.read[me.role] ?? 0);
  const unread = notes.some((e) => e.t > (s.read[me.role] ?? 0));

  // Like the design: notifications count as read after you've looked at the inbox briefly.
  useFocusEffect(
    useCallback(() => {
      if (!unread) return;
      const t = setTimeout(() => markRead(me.role), 1600);
      return () => clearTimeout(t);
    }, [unread, markRead, me.role]),
  );

  const row = (e: AppEvent) => (
    <Row
      key={e.id}
      t={e.text}
      s={`${orgOf(e)} · ${ago(e.t)}`}
      dot={e.t > rd}
      ic={NOTE_IC[e.role] ?? "bell"}
      onPress={() => open(e)}
    />
  );
  const fresh = notes.filter((e) => e.t > rd);
  const old = notes.filter((e) => e.t <= rd);
  return (
    <Screen title="Notifications" backLabel={TAB_LABEL[nav.tab]}>
      {fresh.length ? <List h="New">{fresh.map(row)}</List> : null}
      <List
        h={fresh.length ? "Earlier" : undefined}
        empty={
          fresh.length
            ? undefined
            : "No notifications yet. You will be notified here when something needs you."
        }
      >
        {old.map(row)}
      </List>
    </Screen>
  );
}

export function Me() {
  const T = useT();
  const nav = useNav();
  const me = useMe();
  const { signOut } = useSession();
  const { s, offline, reset } = useStore();
  const { mode, setMode } = useTheme();
  const [push, setPush] = useState(true);
  const [outbox, setOutbox] = useState(false);
  const nq = s.outbox.length;
  const area =
    me.role === "vht"
      ? [
          "Area",
          [
            ...new Set(s.hotspots.filter((h) => h.vhts.includes(me.name)).map((h) => h.subcounty)),
          ].join(" & ") || "—",
        ]
      : me.role === "hm"
        ? ["Hotspot", s.hotspots.find((h) => h.id === HM_HOTSPOT)?.name ?? "—"]
        : ["Motorbike", RIDER.plate];
  return (
    <Screen title="Me" root>
      <Section>
        <View style={{ alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 16 }}>
          <Avatar ini={initials(me.name)} size={72} />
          <Txt style={{ ...TYPE.title, fontWeight: T.ios ? "700" : "600", textAlign: "center" }}>
            {me.name}
          </Txt>
          <Txt
            style={{ color: T.fg2, ...TYPE.subhead, textAlign: "center" }}
          >{`${ROLE_LABEL[me.role]} · ${DCFP.district}`}</Txt>
        </View>
      </Section>
      <List h="Account">
        <Row t="Username" v={me.username} />
        {me.phone ? <Row t="Phone" v={me.phone} /> : null}
        <Row t={area[0]} v={area[1]} />
      </List>
      <Fields
        card
        h="Appearance"
        f={mode === "system" ? "Follows your phone's light or dark setting." : undefined}
      >
        <Seg<ThemeMode>
          label="Theme"
          options={[
            ["system", "System"],
            ["light", "Light"],
            ["dark", "Dark"],
          ]}
          value={mode}
          onChange={setMode}
        />
      </Fields>
      <Fields card h="Notifications">
        <Toggle
          label="Push notifications"
          sub="Order and delivery updates"
          value={push}
          onChange={setPush}
        />
      </Fields>
      <List
        h="Offline"
        f="Anything you do without network is saved on this phone and sent automatically when you are back online."
      >
        <Row t="Connection" v={offline ? "Offline" : "Online"} vfg={offline ? T.warnFg : T.fg2} />
        <Row
          t="Waiting to send"
          v={String(nq)}
          chev={nq > 0}
          onPress={nq ? () => setOutbox(true) : undefined}
        />
      </List>
      <List h="Support">
        <Row t="Help & guides" ic="help" chev onPress={() => nav.go("help")} />
        <Row
          t="Call district focal person"
          s={`${DCFP.name} · ${DCFP.phone}`}
          ic="phone"
          onPress={() => call(DCFP.phone)}
        />
      </List>
      {me.demo ? (
        <List h="Demo" f="You're using sample Wakiso data. It stays on this phone.">
          <Row t="Reset sample data" fg={T.tint} onPress={reset} />
        </List>
      ) : null}
      <List f={`CLIMS mobile 2.0 · ${Platform.OS === "ios" ? "iOS" : "Android"}`}>
        <Row
          t="Sign out"
          fg={T.danger}
          onPress={async () => {
            await signOut();
            router.replace("/signin");
          }}
        />
      </List>
      <Sheet
        visible={outbox}
        title="Waiting to send"
        icon="clock"
        tone={offline ? "warning" : "info"}
        onClose={() => setOutbox(false)}
      >
        {offline ? (
          <Txt style={{ marginHorizontal: 24, marginBottom: 12, color: T.fg2, ...TYPE.subhead }}>
            These will send automatically when the phone is back online.
          </Txt>
        ) : null}
        <List empty="Nothing waiting.">
          {s.outbox.map((it) => (
            <Row key={it.id} t={it.label} s={`Saved ${ago(it.at)}`} ic="upload" />
          ))}
        </List>
      </Sheet>
    </Screen>
  );
}

const GUIDES: Record<string, [string, string][]> = {
  vht: [
    [
      "Mapping a hotspot",
      "Stand at the entrance and capture GPS. Add the contact person and a photo of the dispenser.",
    ],
    [
      "Requesting stock for a hotspot",
      "Count what is left with the contact person, then send. The district reviews it within a day.",
    ],
  ],
  hm: [
    [
      "Reporting a stockout",
      "Tap Report stockout on Home. Count what is left and say how much you need.",
    ],
    [
      "When the rider arrives",
      "Count the condoms with the rider, sign the delivery note, then confirm receipt in the app.",
    ],
  ],
  rider: [
    [
      "Collecting stock",
      "Check the delivery note and batch numbers against what you load at the district store.",
    ],
    [
      "At the hotspot",
      "Count with the contact person, get their signature and photograph the signed delivery note.",
    ],
    [
      "No network at the hotspot",
      "Finish the handover anyway. It sends when you have network again.",
    ],
  ],
};

export function Help() {
  const me = useMe();
  return (
    <Screen title="Help" backLabel="Me">
      <List h="Guides">
        {GUIDES[me.role].map(([t, s]) => (
          <Row key={t} t={t} s={s} fw="500" />
        ))}
      </List>
      <List
        h="Contact"
        f="Working without network? Keep going — the app saves your work and sends it later."
      >
        <Row
          t={`Call ${DCFP.name}`}
          s={`District focal person · ${DCFP.district}`}
          ic="phone"
          onPress={() => call(DCFP.phone)}
        />
      </List>
    </Screen>
  );
}
