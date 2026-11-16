import React from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.lg,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!active) Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.md,
              backgroundColor: active ? colors.surface : "transparent",
              borderWidth: active ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            <AppText
              variant="label"
              style={{
                color: active ? colors.brandText : colors.textMuted,
                fontFamily: active ? "Poppins-SemiBold" : "Poppins-Medium",
              }}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default SegmentedControl;
