import React, { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from "react-native";

/**
 * Motion for the field app. Everything here runs on the native thread where it can, keeps to
 * short durations (under 400ms) so it never slows a task down, and holds still when the phone
 * asks for reduced motion.
 */

/** True when the phone's "reduce motion" setting is on; follows changes while the app runs. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => live && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** 0 → 1 once, after `delay` ms, when the component first appears. */
export function useEntrance(delay = 0, duration = 320): Animated.Value {
  const reduce = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [v, delay, duration, reduce]);
  return v;
}

/**
 * Fades a block in while it rises 8dp. In a list, pass the row's index: rows arrive one after
 * another, 40ms apart, and only the first eight are staggered so long lists never wait.
 */
export function FadeInUp({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const v = useEntrance(Math.min(index, 8) * 40);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Spring press feedback: the target shrinks a little under the finger and springs back on release.
 * Spread `handlers` onto a Pressable and put `scale` in an Animated.View transform around it.
 */
export function usePressScale(to = 0.97) {
  const reduce = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (toValue: number) =>
    reduce
      ? scale.setValue(1)
      : Animated.spring(scale, {
          toValue,
          damping: 15,
          stiffness: 320,
          mass: 0.6,
          useNativeDriver: true,
        }).start();
  return {
    scale,
    handlers: { onPressIn: () => spring(to), onPressOut: () => spring(1) },
  };
}
