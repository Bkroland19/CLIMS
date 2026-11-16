import React from "react";
import { View } from "react-native";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

export interface Bar {
  label: string;
  value: number;
}

const HEIGHT = 120;

/** Simple vertical bar chart (theme-aware, with value labels so it never relies on colour alone). */
const WeeklyBars: React.FC<{ data: Bar[]; unit?: string }> = ({ data, unit = "pieces" }) => {
  const { colors, radius } = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  const summary = data.map((d) => `${d.label}: ${d.value} ${unit}`).join(", ");

  return (
    <View
      accessible
      accessibilityLabel={`Bar chart. ${summary}`}
      style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}
    >
      {data.map((d) => {
        const h = d.value === 0 ? 4 : Math.max(8, (d.value / max) * HEIGHT);
        return (
          <View key={d.label} style={{ flex: 1, alignItems: "center" }}>
            <AppText
              variant="caption"
              color={d.value ? "text" : "textMuted"}
              style={{ marginBottom: 4 }}
            >
              {d.value}
            </AppText>
            <View
              style={{
                width: "100%",
                maxWidth: 44,
                height: h,
                borderRadius: radius.sm,
                backgroundColor: d.value ? colors.brand : colors.surfaceAlt,
              }}
            />
            <AppText variant="caption" color="textMuted" style={{ marginTop: 6 }}>
              {d.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
};

export default WeeklyBars;
