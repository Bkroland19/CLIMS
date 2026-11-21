import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useT } from "@/lib/theme";
import { TABS, type TabKey } from "@/lib/nav";
import { useMe } from "@/lib/session";
import { HM_HOTSPOT, RIDER } from "@/lib/seed";
import { useStore } from "@/lib/store";
import { MAX_SHEET_WIDTH, useResponsive } from "@/hooks/useResponsive";
import Icon from "./Icon";
import { Txt } from "./kit";

/** Badge counts per tab, as in the design: things that need the user. */
function useBadges(): Partial<Record<TabKey, number>> {
  const { s } = useStore();
  const me = useMe();
  // Same rule as the Hotspots tab: signed-in VHTs count their submitted (API) hotspots only.
  const mine = s.hotspots
    .filter((h) =>
      me.demo ? h.vhts.includes(me.name) || h.contact === me.name : h.source === "api",
    )
    .map((h) => h.id);
  return {
    requests: s.orders.filter((o) => mine.includes(o.hotspotId) && o.status === "delivered").length,
    // Signed-in managers' API orders end at delivery, so nothing waits on them in the tab.
    orders: me.demo
      ? s.orders.filter((o) => o.hotspotId === HM_HOTSPOT && o.status === "delivered").length
      : 0,
    deliveries: s.orders.filter(
      (o) =>
        o.delivery?.riderId === RIDER.id &&
        (o.status === "dispatched" || o.status === "in_transit"),
    ).length,
  };
}

export default function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const T = useT();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const badges = useBadges();
  const defs = TABS[me.role];
  const current = state.routes[state.index]?.name;
  const { isTablet, isShort } = useResponsive();
  // Wide or short windows put the label beside the icon, as iPadOS and Material rails do.
  const beside = isTablet || isShort;

  return (
    <View
      style={{
        backgroundColor: T.tabBg,
        borderTopWidth: T.ios ? StyleSheet.hairlineWidth : 0,
        borderTopColor: T.tabBd,
        paddingTop: beside ? 6 : T.ios ? 6 : 12,
        paddingBottom: Math.max(insets.bottom, beside ? 6 : T.ios ? 6 : 16),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          width: "100%",
          maxWidth: MAX_SHEET_WIDTH,
          alignSelf: "center",
        }}
      >
        {defs.map((d) => {
          const route = state.routes.find((r) => r.name === d.key);
          if (!route) return null;
          const on = current === d.key;
          const b = badges[d.key] ?? 0;
          const onPress = () => {
            const ev = emitter.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (ev.defaultPrevented) return;
            Haptics.selectionAsync().catch(() => {});
            navigateToTab(route.key);
          };
          const fg = on ? T.tabActive : T.tabIdle;
          return (
            <Pressable
              key={d.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={b ? `${d.label}, ${b} new` : d.label}
              style={{
                flex: 1,
                flexDirection: beside ? "row" : "column",
                alignItems: "center",
                justifyContent: "center",
                gap: beside ? 6 : T.ios ? 2 : 4,
                minHeight: 48,
                paddingHorizontal: 2,
              }}
            >
              {/* Active tab: icon and label turn the brand colour; no background pill. */}
              <View
                style={{
                  width: 32,
                  height: T.ios ? 28 : 32,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={d.icon} size={T.ios ? 25 : 24} color={fg} strokeWidth={on ? 2.4 : 2} />
                {b > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: T.ios ? -2 : 0,
                      left: 20,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      paddingHorizontal: 5,
                      backgroundColor: T.ios ? "#ff3b30" : "#ba1a1a",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Txt
                      maxFontSizeMultiplier={1.2}
                      style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}
                    >
                      {b > 99 ? "99+" : String(b)}
                    </Txt>
                  </View>
                ) : null}
              </View>
              <Txt
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{
                  flexShrink: 1,
                  fontSize: beside ? 13 : T.ios ? 10 : 12,
                  color: fg,
                  fontWeight: on ? (T.ios ? "500" : "700") : "500",
                }}
              >
                {d.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
