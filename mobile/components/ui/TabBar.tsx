import React from "react";
import { Pressable, View } from "react-native";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

const ICONS: Record<
  string,
  [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap, string]
> = {
  home: ["home-outline", "home", "Home"],
  stock: ["cube-outline", "cube", "Stock"],
  hotspot: ["location-outline", "location", "Hotspots"],
  profile: ["person-outline", "person", "Profile"],
};

/** Themed bottom navigation: icon + label, 48dp+ targets, haptic tap. */
const TabBar: React.FC<BottomTabBarProps> = ({ state, emitter, navigateToTab }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.tabBar,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingHorizontal: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const [outline, filled, label] = ICONS[route.name] ?? [
          "ellipse-outline",
          "ellipse",
          route.name,
        ];

        const onPress = () => {
          const event = emitter.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            Haptics.selectionAsync().catch(() => {});
            navigateToTab(route.key);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            style={{ flex: 1, alignItems: "center", minHeight: 56 }}
          >
            <View style={{ paddingVertical: 4 }}>
              <Ionicons
                name={focused ? filled : outline}
                size={24}
                color={focused ? colors.brandText : colors.textMuted}
              />
            </View>
            <AppText
              variant="caption"
              style={{
                marginTop: 2,
                color: focused ? colors.brandText : colors.textMuted,
                fontFamily: focused ? "Poppins-SemiBold" : "Poppins-Regular",
              }}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
};

export default TabBar;
