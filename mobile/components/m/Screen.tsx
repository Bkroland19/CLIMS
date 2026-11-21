import React from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useT } from "@/lib/theme";
import { useNav } from "@/lib/nav";
import { useStore, useUnread } from "@/lib/store";
import { useColumn, useResponsive } from "@/hooks/useResponsive";
import { useKeyboardScroll } from "@/hooks/useKeyboardScroll";
import Icon, { type IconName } from "./Icon";
import { Txt } from "./kit";
import { TYPE } from "@/lib/fonts";

export interface ScreenAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
}

/**
 * Page shell. Tab roots get a large title (iOS) or a top app bar (Android);
 * detail pages get a back button. A screen's main action is an extended FAB on
 * Android and a header button on iOS, matching each platform. Tab roots also get
 * a notifications bell (with unread badge) at the top right.
 */
export default function Screen({
  title,
  root,
  backLabel = "Back",
  fab,
  children,
  scrollRef,
  noHeader,
  onEndReached,
}: {
  title: string;
  root?: boolean;
  backLabel?: string;
  fab?: ScreenAction;
  children: React.ReactNode;
  scrollRef?: React.Ref<ScrollViewInstance>;
  noHeader?: boolean;
  /** Called when the user scrolls near the end, to load the next page of a list. */
  onEndReached?: () => void;
}) {
  const T = useT();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { offline, s } = useStore();
  const nq = s.outbox.length;
  const hasBack = !root;
  const action = T.ios ? fab : undefined;
  const unread = useUnread();
  const showBell = !!root && !noHeader;
  const setScroll = useKeyboardScroll(scrollRef);
  // Tab roots sit under the Ministry green band; detail pages keep a plain
  // header so the band marks "you are at the top of a section".
  const band = !!root && !noHeader;
  const hdrBg = band ? T.brand : T.hdrBg;
  const hdrFg = band ? T.brandFg : T.fg;
  const { isCompact, isShort, width } = useResponsive();
  const col = useColumn();
  // Short windows (split screen) get an inline title instead of the 52dp large title.
  const largeTitle = T.ios && !hasBack && !isShort;

  const bell = showBell ? (
    <Pressable
      onPress={() => nav.go("inbox")}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : "Notifications"}
      hitSlop={4}
      style={({ pressed }) => ({
        width: T.ios ? 44 : 48,
        height: T.ios ? 44 : 48,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed && !T.ios ? (band ? T.brandPress : T.rowPress) : "transparent",
        opacity: pressed && T.ios ? 0.5 : 1,
        zIndex: 1,
      })}
    >
      <Icon name="bell" size={24} color={band ? T.brandFg : T.ios ? T.tint : T.fg} />
      {unread > 0 ? (
        <View
          style={{
            position: "absolute",
            top: T.ios ? 6 : 8,
            left: T.ios ? 24 : 26,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 5,
            backgroundColor: T.ios ? "#ff3b30" : "#ba1a1a",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: hdrBg,
          }}
        >
          <Txt style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
            {unread > 99 ? "99+" : String(unread)}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  ) : null;

  const header = noHeader ? (
    <View style={{ height: insets.top, backgroundColor: T.bg }} />
  ) : T.ios ? (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: hdrBg,
        borderBottomWidth: hasBack ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: T.hdrBd,
      }}
    >
      <View
        style={[
          col.style,
          {
            height: 44,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 8,
          },
        ]}
      >
        {hasBack ? (
          <Pressable
            onPress={nav.back}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${backLabel}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              height: 44,
              maxWidth: "42%",
              zIndex: 1,
            }}
          >
            <Icon name="chevL" size={26} color={T.tint} />
            <Txt numberOfLines={1} style={{ color: T.tint, fontSize: 17 }}>
              {backLabel}
            </Txt>
          </Pressable>
        ) : (
          <View />
        )}
        {!largeTitle ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: "28%", right: "28%", alignItems: "center" }}
          >
            <Txt
              accessibilityRole={hasBack ? undefined : "header"}
              numberOfLines={1}
              style={{ fontSize: 17, fontWeight: "600", color: hdrFg }}
            >
              {title}
            </Txt>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {bell}
          {action ? (
            <Pressable
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={{
                height: 44,
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1,
              }}
            >
              <Icon name="plus" size={26} color={band ? T.brandFg : T.tint} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {largeTitle ? (
        <View style={col.style}>
          <Txt
            accessibilityRole="header"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              paddingHorizontal: 16,
              paddingBottom: 8,
              fontSize: isCompact ? 26 : 30,
              fontWeight: "700",
              lineHeight: isCompact ? 32 : 36,
              color: hdrFg,
            }}
          >
            {title}
          </Txt>
        </View>
      ) : null}
    </View>
  ) : (
    <View style={{ paddingTop: insets.top, backgroundColor: hdrBg }}>
      <View
        style={[
          col.style,
          {
            height: isShort ? 56 : 64,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          },
        ]}
      >
        <View style={{ width: hasBack ? 0 : 12 }} />
        {hasBack ? (
          <Pressable
            onPress={nav.back}
            accessibilityRole="button"
            accessibilityLabel={`Back to ${backLabel}`}
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="arrowL" size={24} color={T.fg} />
          </Pressable>
        ) : null}
        <Txt
          accessibilityRole="header"
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: isCompact ? 19 : 20,
            lineHeight: 28,
            color: hdrFg,
            fontWeight: band ? "600" : "400",
          }}
        >
          {title}
        </Txt>
        {bell}
        <View style={{ width: 0 }} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar style={band || T.dark ? "light" : "dark"} />
      {header}
      {offline ? (
        <View style={{ backgroundColor: T.offBg }}>
          <View
            style={[
              col.style,
              {
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 8,
              },
            ]}
          >
            <Icon name="wifiOff" size={16} color={T.warnFg} />
            <Txt style={{ flex: 1, color: T.warnFg, ...TYPE.footnote, fontWeight: "500" }}>
              {nq
                ? `Offline · ${nq} action${nq > 1 ? "s" : ""} saved on this phone`
                : "Offline · your work is saved on this phone"}
            </Txt>
          </View>
        </View>
      ) : null}
      {/* Padding on both platforms: Android draws edge to edge, so the window no longer resizes
          for the keyboard and the form would sit underneath it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          ref={setScroll}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={250}
          onScroll={
            onEndReached
              ? (e) => {
                  const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                  // Start loading a screen's height before the end, so scrolling rarely waits.
                  if (
                    layoutMeasurement.height + contentOffset.y >=
                    contentSize.height - layoutMeasurement.height
                  )
                    onEndReached();
                }
              : undefined
          }
          contentContainerStyle={[
            col.style,
            {
              paddingTop: T.ios ? 6 : 4,
              paddingBottom: fab && !T.ios ? 96 : 28,
            },
          ]}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
      {fab && !T.ios ? (
        <Pressable
          onPress={fab.onPress}
          accessibilityRole="button"
          accessibilityLabel={fab.label}
          style={({ pressed }) => ({
            position: "absolute",
            right: col.right + 16,
            bottom: 16,
            maxWidth: Math.max(0, width - col.right * 2 - 32),
            minHeight: 56,
            paddingVertical: 8,
            borderRadius: 16,
            paddingHorizontal: 18,
            backgroundColor: pressed ? T.fabPress : T.fabBg,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            elevation: 3,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
          })}
        >
          <Icon name={fab.icon ?? "plus"} size={22} color={T.fabFg} />
          <Txt
            numberOfLines={1}
            style={{ flexShrink: 1, color: T.fabFg, fontSize: 15, fontWeight: "500" }}
          >
            {fab.label}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
