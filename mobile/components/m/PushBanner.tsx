import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Animated, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/theme";
import { useMe } from "@/lib/session";
import { isUnread } from "@/lib/notifications";
import { shownAsPush } from "@/lib/push";
import { useNotes, useStore } from "@/lib/store";
import type { AppEvent } from "@/lib/types";
import { orgOf, useOpenNote } from "@/screens/shared";
import { MAX_SHEET_WIDTH } from "@/hooks/useResponsive";
import Icon from "./Icon";
import { Txt } from "./kit";
import { TYPE } from "@/lib/fonts";

/**
 * Heads-up banner for the newest unread notification: once shortly after sign-in, as in the design,
 * and again whenever a new notification arrives from the API while the app is open. Push to a
 * closed app needs a push service on the server; this is the in-app half.
 */
export default function PushBanner() {
  const T = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = useMe();
  const { s, ready } = useStore();
  const notes = useNotes();
  const open = useOpenNote();
  const [ev, setEv] = useState<AppEvent | null>(null);
  // Entries already on the phone or already shown, so each new one appears once.
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<{
    show?: ReturnType<typeof setTimeout>;
    hide?: ReturnType<typeof setTimeout>;
  }>({});
  const [y] = useState(() => new Animated.Value(-160));

  useEffect(() => {
    if (!ready) return;
    const read = s.read[me.role] ?? 0;
    let e: AppEvent | undefined;
    if (!seen.current) {
      // First look after sign-in: the newest unread entry, as before.
      seen.current = new Set(notes.map((x) => x.id));
      e = notes.find((x) => isUnread(x, read));
    } else {
      // One that already popped up as a system push isn't announced again.
      e = notes.find(
        (x) =>
          !seen.current!.has(x.id) &&
          isUnread(x, read) &&
          !(x.serverId && shownAsPush.has(x.serverId)),
      );
      for (const x of notes) seen.current.add(x.id);
    }
    if (!e) return;
    const next = e;
    // Timers live in refs, not this effect's cleanup: the notes change on every refresh, and that
    // must not cancel a banner on its way in or out. A newer banner replaces one still showing.
    clearTimeout(timers.current.show);
    clearTimeout(timers.current.hide);
    timers.current.show = setTimeout(() => {
      setEv(next);
      Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
    }, 900);
    timers.current.hide = setTimeout(() => {
      Animated.timing(y, { toValue: -160, duration: 220, useNativeDriver: true }).start(() =>
        setEv(null),
      );
    }, 6400);
  }, [ready, notes, s.read, me.role, y]);

  useEffect(
    () => () => {
      clearTimeout(timers.current.show);
      clearTimeout(timers.current.hide);
    },
    [],
  );

  if (!ev) return null;
  // Centred and capped on tablets; clear of notches at the sides.
  const centre = Math.max(0, (width - MAX_SHEET_WIDTH) / 2);
  const left = Math.max(8, centre, insets.left + 8);
  const right = Math.max(8, centre, insets.right + 8);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left,
        right,
        top: insets.top + (T.ios ? 4 : 8),
        transform: [{ translateY: y }],
        zIndex: 50,
      }}
    >
      <Pressable
        onPress={() => {
          setEv(null);
          open(ev);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Notification from ${orgOf(ev)}: ${ev.text}`}
        style={{
          flexDirection: "row",
          gap: 12,
          padding: 14,
          borderRadius: T.ios ? 22 : 18,
          backgroundColor: T.pushBg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: T.cardBd,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: T.ios ? 9 : 19,
            backgroundColor: T.brand,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="bell" size={20} color={T.brandFg} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Txt style={{ ...TYPE.footnote, color: T.fg2, flex: 1 }} numberOfLines={1}>
              <Txt style={{ ...TYPE.footnote, color: T.fg, fontWeight: "600" }}>CLIMS</Txt>
              {` · ${orgOf(ev)}`}
            </Txt>
            <Txt style={{ ...TYPE.footnote, color: T.fg3 }}>now</Txt>
          </View>
          <Txt style={{ ...TYPE.subhead, fontWeight: "500" }} numberOfLines={2}>
            {ev.text}
          </Txt>
        </View>
      </Pressable>
    </Animated.View>
  );
}
