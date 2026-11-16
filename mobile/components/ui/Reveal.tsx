import React from "react";
import Animated, { FadeInDown } from "react-native-reanimated";
import { StyleProp, ViewStyle } from "react-native";

/** Gentle fade-and-rise entrance. `index` staggers siblings (capped). */
const Reveal: React.FC<{
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ index = 0, children, style }) => (
  <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 60).duration(350)} style={style}>
    {children}
  </Animated.View>
);

export default Reveal;
