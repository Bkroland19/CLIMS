import React from "react";
import { View } from "react-native";
import { Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/theme";
import { Btn, Btns, Txt } from "@/components/m/kit";
import Icon from "@/components/m/Icon";
import { MAX_FORM_WIDTH, useColumn } from "@/hooks/useResponsive";

/**
 * Shown for links that match no screen. Built from the field app's kit, which needs only the theme the
 * root layout provides, so it renders whether or not anyone is signed in.
 */
export default function NotFoundScreen() {
  const T = useT();
  const insets = useSafeAreaInsets();
  const col = useColumn(MAX_FORM_WIDTH);
  return (
    <>
      <Stack.Screen options={{ title: "Page not found" }} />
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          backgroundColor: T.bg,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <View style={[col.style, { alignItems: "center", paddingHorizontal: 24, gap: 12 }]}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: T.icBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="help" size={40} color={T.icFg} />
          </View>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 22, fontWeight: "700", textAlign: "center" }}
          >
            We couldn&apos;t find that page
          </Txt>
          <Txt style={{ color: T.fg2, fontSize: 15, textAlign: "center", lineHeight: 21 }}>
            It may have moved or no longer exists.
          </Txt>
        </View>
        <View style={[col.style, { marginTop: 24 }]}>
          <Btns>
            <Btn label="Back to start" onPress={() => router.replace("/")} />
          </Btns>
        </View>
      </View>
    </>
  );
}
