import React from "react";
import { View } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

/** Small pill shown only while the device has no internet connection. */
const OfflineBanner: React.FC = () => {
  const net = useNetInfo();
  const insets = useSafeAreaInsets();
  const { colors, radius } = useTheme();

  if (net.isConnected !== false) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: insets.top + 4,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.warningSoft,
        borderWidth: 1,
        borderColor: colors.warning,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 6,
        zIndex: 100,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
      <AppText variant="caption" style={{ color: colors.warning, marginLeft: 6 }}>
        You&apos;re offline
      </AppText>
    </View>
  );
};

export default OfflineBanner;
