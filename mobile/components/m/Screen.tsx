import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/theme";
import { useNav } from "@/lib/nav";
import { useStore, useUnread } from "@/lib/store";
import Icon, { type IconName } from "./Icon";
import { Txt } from "./kit";

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
}: {
  title: string;
  root?: boolean;
  backLabel?: string;
  fab?: ScreenAction;
  children: React.ReactNode;
  scrollRef?: React.Ref<ScrollViewInstance>;
  noHeader?: boolean;
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
        backgroundColor: pressed && !T.ios ? T.rowPress : "transparent",
        opacity: pressed && T.ios ? 0.5 : 1,
        zIndex: 1,
      })}
    >
      <Icon name="bell" size={T.ios ? 24 : 24} color={T.ios ? T.tint : T.fg} />
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
            borderColor: T.hdrBg,
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
        backgroundColor: T.hdrBg,
        borderBottomWidth: hasBack ? StyleSheet.hairlineWidth : 0,
        borderBottomColor: T.hdrBd,
      }}
    >
      <View
        style={{
          height: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 8,
        }}
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
        {hasBack ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: "28%", right: "28%", alignItems: "center" }}
          >
            <Txt numberOfLines={1} style={{ fontSize: 17, fontWeight: "600" }}>
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
              <Icon name="plus" size={26} color={T.tint} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {!hasBack ? (
        <Txt
          accessibilityRole="header"
          style={{
            paddingHorizontal: 16,
            paddingBottom: 8,
            fontSize: 34,
            fontWeight: "700",
            lineHeight: 40,
          }}
        >
          {title}
        </Txt>
      ) : null}
    </View>
  ) : (
    <View style={{ paddingTop: insets.top, backgroundColor: T.hdrBg }}>
      <View
        style={{
          height: 64,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: hasBack ? 4 : 16,
          paddingRight: 4,
          gap: 4,
        }}
      >
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
          style={{ flex: 1, fontSize: 22, lineHeight: 28 }}
        >
          {title}
        </Txt>
        {bell}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {header}
      {offline ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: T.offBg,
          }}
        >
          <Icon name="wifiOff" size={16} color={T.warnFg} />
          <Txt style={{ color: T.warnFg, fontSize: 13, fontWeight: "500" }}>
            {nq
              ? `Offline · ${nq} action${nq > 1 ? "s" : ""} saved on this phone`
              : "Offline · your work is saved on this phone"}
          </Txt>
        </View>
      ) : null}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: T.ios ? 6 : 4,
            paddingBottom: fab && !T.ios ? 96 : 28,
          }}
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
            right: 16,
            bottom: 16,
            height: 56,
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
          <Txt style={{ color: T.fabFg, fontSize: 15, fontWeight: "500" }}>{fab.label}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
