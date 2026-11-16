import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import AppText from "./AppText";
import Button from "./Button";

export type DialogTone = "default" | "warning" | "danger";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Pass null for a single-button notice (replaces a plain alert). */
  cancelLabel?: string | null;
  tone?: DialogTone;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props extends ConfirmOptions {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const DEFAULT_ICON: Record<DialogTone, keyof typeof Ionicons.glyphMap> = {
  default: "help-circle",
  warning: "alert-circle",
  danger: "trash",
};

/** Themed replacement for native Alert.alert. */
const ConfirmDialog: React.FC<Props> = ({
  visible,
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  tone = "default",
  icon,
  onConfirm,
  onCancel,
}) => {
  const { colors, radius, shadows } = useTheme();
  const { isCompact } = useResponsive();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, friction: 9 }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 140, useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const palette = {
    default: { fg: colors.brandText, bg: colors.brandSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
  }[tone];

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: progress,
          backgroundColor: colors.overlay,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={cancelLabel === null ? undefined : onCancel}
        />
        <Animated.View
          accessibilityViewIsModal
          style={{
            width: "100%",
            maxWidth: 400,
            backgroundColor: colors.surface,
            borderRadius: radius.xl,
            padding: 24,
            alignItems: "center",
            transform: [
              { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            ],
            ...shadows.raised,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: palette.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name={icon ?? DEFAULT_ICON[tone]} size={32} color={palette.fg} />
          </View>
          <AppText
            variant="title"
            style={{ textAlign: "center", marginTop: 16 }}
            accessibilityRole="header"
          >
            {title}
          </AppText>
          {message ? (
            <AppText variant="body" color="textMuted" style={{ textAlign: "center", marginTop: 8 }}>
              {message}
            </AppText>
          ) : null}
          <View
            style={{
              flexDirection: isCompact || cancelLabel === null ? "column" : "row",
              gap: 12,
              marginTop: 24,
              alignSelf: "stretch",
            }}
          >
            {cancelLabel !== null ? (
              <Button title={cancelLabel} variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
            ) : null}
            <Button
              title={confirmLabel}
              variant={tone === "danger" ? "danger" : "primary"}
              onPress={onConfirm}
              style={{
                flex: 1,
                ...(tone === "warning" ? { backgroundColor: colors.warning } : null),
              }}
            />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

export default ConfirmDialog;
