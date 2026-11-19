import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { AppText, Card, InfoPage } from "@/components/ui";
import { TERMS, TERMS_UPDATED, TERMS_VERSION } from "@/constants/legal";

export default function TermsScreen() {
  const { colors } = useTheme();

  return (
    <InfoPage title="Terms & conditions">
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.brandSoft,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Ionicons name="shield-checkmark" size={30} color={colors.brandText} />
        </View>
        <AppText variant="title" style={{ textAlign: "center" }}>
          Terms & conditions
        </AppText>
        <AppText variant="caption" color="textMuted" style={{ textAlign: "center", marginTop: 4 }}>
          Ministry of Health · Republic of Uganda
        </AppText>
        <AppText variant="caption" color="textMuted" style={{ textAlign: "center" }}>
          Version {TERMS_VERSION} · Last updated {TERMS_UPDATED}
        </AppText>
      </View>

      <Card>
        {TERMS.map((section, i) => (
          <View key={section.title} style={{ marginTop: i === 0 ? 0 : 20 }}>
            <AppText variant="heading" accessibilityRole="header">
              {section.title}
            </AppText>
            {section.body.map((p) => (
              <AppText key={p} variant="body" color="textMuted" style={{ marginTop: 8 }}>
                {p}
              </AppText>
            ))}
          </View>
        ))}
      </Card>
    </InfoPage>
  );
}
