import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";
import Card from "./Card";

/** Titled card that groups related form fields. */
const FormSection: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ icon, title, hint, children }) => {
  const { colors } = useTheme();
  return (
    <Card style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: hint ? 4 : 16 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.brandSoft,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Ionicons name={icon} size={18} color={colors.brandText} />
        </View>
        <AppText variant="heading" style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {hint ? (
        <AppText variant="caption" color="textMuted" style={{ marginBottom: 16 }}>
          {hint}
        </AppText>
      ) : null}
      {children}
    </Card>
  );
};

export default FormSection;
