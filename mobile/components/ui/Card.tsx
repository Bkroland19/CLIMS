import React from "react";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { useTheme } from "@/context/theme/ThemeProvider";

interface Props {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const Card: React.FC<Props> = ({ children, onPress, style, accessibilityLabel }) => {
  const { colors, radius, spacing, shadows, isDark } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: isDark ? 1 : 0,
    borderColor: colors.border,
    ...shadows.card,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
};

export default Card;
