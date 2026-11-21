import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/theme";
import { Section, Txt } from "@/components/m/kit";
import Icon from "@/components/m/Icon";
import { useColumn } from "@/hooks/useResponsive";
import { TERMS, TERMS_UPDATED, TERMS_VERSION } from "@/constants/legal";

/**
 * Terms and conditions. Built from the field app's kit, which needs only the theme the root layout
 * provides, so it opens whether or not anyone is signed in.
 */
export default function TermsScreen() {
  const T = useT();
  const insets = useSafeAreaInsets();
  const col = useColumn();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: T.hdrBg }}>
        <View
          style={[col.style, { height: 56, flexDirection: "row", alignItems: "center", gap: 4 }]}
        >
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={T.ios ? "chevL" : "arrowL"} size={24} color={T.ios ? T.tint : T.fg} />
          </Pressable>
          <Txt accessibilityRole="header" numberOfLines={1} style={{ flex: 1, fontSize: 20 }}>
            Terms &amp; conditions
          </Txt>
        </View>
      </View>
      <ScrollView contentContainerStyle={[col.style, { paddingBottom: insets.bottom + 28 }]}>
        <View style={{ alignItems: "center", gap: 6, paddingVertical: 20, paddingHorizontal: 24 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: T.icBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="shield" size={30} color={T.icFg} />
          </View>
          <Txt style={{ fontSize: 15, color: T.fg2, textAlign: "center" }}>
            Ministry of Health · Republic of Uganda
          </Txt>
          <Txt style={{ fontSize: 13, color: T.fg2, textAlign: "center" }}>
            {`Version ${TERMS_VERSION} · Last updated ${TERMS_UPDATED}`}
          </Txt>
        </View>
        {TERMS.map((section) => (
          <Section key={section.title} h={section.title}>
            <View style={{ marginHorizontal: 16, gap: 8 }}>
              {section.body.map((p) => (
                <Txt key={p} style={{ fontSize: 15, lineHeight: 22, color: T.fg }}>
                  {p}
                </Txt>
              ))}
            </View>
          </Section>
        ))}
      </ScrollView>
    </View>
  );
}
