import React, { useEffect, useState } from "react";
import { Animated, DimensionValue, StyleProp, ViewStyle } from "react-native";
import { useTheme } from "@/context/theme/ThemeProvider";

const Skeleton: React.FC<{
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
}> = ({ width = "100%", height = 16, style }) => {
  const { colors, radius } = useTheme();
  const opacity = useState(() => new Animated.Value(0.5))[0];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, opacity },
        style,
      ]}
    />
  );
};

export default Skeleton;
