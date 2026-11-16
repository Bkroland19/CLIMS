import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

type ToastType = "success" | "error" | "info";

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Non-blocking feedback that replaces native alert pop-ups. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors, radius, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ id: number; message: string; type: ToastType } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
      setToast(null),
    );
  }, [anim]);

  const show = useCallback(
    (type: ToastType, message: string) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), message, type });
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      if (type === "success")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (type === "error")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      timer.current = setTimeout(hide, type === "error" ? 5000 : 3000);
    },
    [anim, hide],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => show("success", m),
      error: (m) => show("error", m),
      info: (m) => show("info", m),
    }),
    [show],
  );

  const tone = toast
    ? {
        success: { bg: colors.successSoft, fg: colors.success, icon: "checkmark-circle" as const },
        error: { bg: colors.dangerSoft, fg: colors.danger, icon: "alert-circle" as const },
        info: { bg: colors.brandSoft, fg: colors.brandText, icon: "information-circle" as const },
      }[toast.type]
    : null;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && tone ? (
        <Animated.View
          key={toast.id}
          accessibilityLiveRegion="polite"
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: 16,
            right: 16,
            zIndex: 200,
            opacity: anim,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
            ],
          }}
        >
          <Pressable
            onPress={hide}
            accessibilityRole="alert"
            accessibilityHint="Tap to dismiss"
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: tone.bg,
              borderWidth: 1,
              borderColor: tone.fg,
              borderRadius: radius.lg,
              padding: 14,
              ...shadows.raised,
            }}
          >
            <Ionicons name={tone.icon} size={22} color={tone.fg} />
            <AppText variant="body" style={{ flex: 1, marginLeft: 10, color: tone.fg }}>
              {toast.message}
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
};
