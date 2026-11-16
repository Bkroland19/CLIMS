import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import AppText from "./AppText";

interface Props {
  title: string;
  children: React.ReactNode;
}

/** Full-screen content page with a back button, used for Help & support and Terms. */
const InfoPage: React.FC<Props> = ({ title, children }) => {
  const { colors } = useTheme();
  const { contentStyle, gutter } = useResponsive();

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/profile"));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: gutter,
          paddingVertical: 8,
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{
            width: 48,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: -8,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <AppText
          variant="heading"
          accessibilityRole="header"
          style={{ flex: 1, marginLeft: 4 }}
          numberOfLines={1}
        >
          {title}
        </AppText>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[contentStyle, { padding: gutter, paddingBottom: 40 }]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
};

export default InfoPage;
