import React, { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { SessionProvider, useSession } from "@/lib/session";

SplashScreen.preventAutoHideAsync();
// Fade into the first screen instead of cutting; the splash uses the same background and crest
// tile as sign-in (see the expo-splash-screen plugin in app.json).
SplashScreen.setOptions({ fade: true, duration: 300 });

function Shell() {
  const { T, scheme } = useTheme();
  const { restoring } = useSession();
  useEffect(() => {
    if (!restoring) SplashScreen.hideAsync();
  }, [restoring]);
  if (restoring) return null;
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
