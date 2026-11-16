import React from "react";
import { Linking, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/context/theme/ThemeProvider";
import { AppText, Button, Card, FaqItem, InfoPage } from "@/components/ui";
import { FAQS, SUPPORT_EMAIL } from "@/constants/legal";

export default function HelpScreen() {
  const { colors } = useTheme();

  const emailSupport = () => {
    const subject = encodeURIComponent("LMD app support");
    const body = encodeURIComponent("Name:\nHotspot:\nWhat happened:\n");
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {});
  };

  return (
    <InfoPage title="Help & support">
      <Card style={{ backgroundColor: colors.brandSoft, borderWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            <Ionicons name="headset-outline" size={22} color={colors.brandText} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="heading" color="brandText">
              Need a hand?
            </AppText>
            <AppText variant="caption" color="brandText">
              Our support team will help you.
            </AppText>
          </View>
        </View>
        <AppText variant="body" color="brandText" style={{ marginTop: 12 }}>
          Email us at {SUPPORT_EMAIL}. Please include your name, your hotspot, and what you were
          trying to do.
        </AppText>
        <Button
          title="Email support"
          icon="mail-outline"
          onPress={emailSupport}
          style={{ marginTop: 14 }}
        />
      </Card>

      <AppText variant="heading" style={{ marginTop: 28, marginBottom: 8 }}>
        Common questions
      </AppText>
      <Card style={{ paddingVertical: 4 }}>
        {FAQS.map((f, i) => (
          <FaqItem key={f.q} question={f.q} answer={f.a} last={i === FAQS.length - 1} />
        ))}
      </Card>

      <Button
        title="Read the terms & conditions"
        variant="ghost"
        icon="document-text-outline"
        onPress={() => router.push("/terms")}
        style={{ marginTop: 24 }}
      />
    </InfoPage>
  );
}
