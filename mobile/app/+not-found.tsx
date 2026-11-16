import { Link, Stack } from "expo-router";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { AppText, Button } from "@/components/ui";
import { router } from "expo-router";

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Page not found" }} />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          backgroundColor: colors.bg,
        }}
      >
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: colors.brandSoft,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Ionicons name="compass-outline" size={40} color={colors.brandText} />
        </View>
        <AppText variant="title" style={{ textAlign: "center" }}>
          We couldn't find that page
        </AppText>
        <AppText variant="body" color="textMuted" style={{ textAlign: "center", marginTop: 6 }}>
          It may have moved or no longer exists.
        </AppText>
        <Button
          title="Back to start"
          onPress={() => router.replace("/")}
          style={{ marginTop: 24, alignSelf: "stretch" }}
        />
      </View>
    </>
  );
}
