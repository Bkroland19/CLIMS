import React from "react";
import { Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label,
  active,
  onPress,
}) => {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        minHeight: 40,
        paddingHorizontal: 16,
        marginRight: 8,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.pill,
        backgroundColor: active ? colors.brand : colors.surface,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.border,
      }}
    >
      <AppText variant="label" style={{ color: active ? colors.onBrand : colors.textMuted }}>
        {label}
      </AppText>
    </Pressable>
  );
};

export default Chip;
