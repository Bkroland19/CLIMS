import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/theme";
import { useMe } from "@/lib/session";
import { useNotes, useStore } from "@/lib/store";
import type { AppEvent } from "@/lib/types";
import { orgOf, useOpenNote } from "@/screens/shared";
import { MAX_SHEET_WIDTH } from "@/hooks/useResponsive";
import Icon from "./Icon";
import { Txt } from "./kit";
import { TYPE } from "@/lib/fonts";

/**
 * Heads-up banner for the newest unread notification, shown once per app launch
 * shortly after sign-in, as in the design. Real push needs a server; this is the in-app half.
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
  const shown = useRef(false);
  const [y] = useState(() => new Animated.Value(-160));

  useEffect(() => {
    if (!ready || shown.current) return;
    const read = s.read[me.role] ?? 0;
    const e = notes.find((x) => x.t > read);
    if (!e) return;
    shown.current = true;
    const t1 = setTimeout(() => {
      setEv(e);
      Animated.spring(y, { toValue: 0, useNativeDriver: true }).start();
    }, 900);
    const t2 = setTimeout(() => {
      Animated.timing(y, { toValue: -160, duration: 220, useNativeDriver: true }).start(() =>
        setEv(null),
      );
    }, 6400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [ready, notes, s.read, me.role, y]);

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
            backgroundColor: T.b1Bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="bell" size={20} color={T.b1Fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt
            style={{ ...TYPE.footnote, color: T.fg2 }}
            numberOfLines={1}
          >{`CLIMS · ${orgOf(ev)}`}</Txt>
          <Txt style={{ ...TYPE.subhead, fontWeight: "500" }} numberOfLines={2}>
            {ev.text}
          </Txt>
        </View>
      </Pressable>
    </Animated.View>
  );
}
