import React, { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { SessionProvider, useSession } from "@/lib/session";
import { FontsReady, useAppFonts } from "@/lib/fonts";

SplashScreen.preventAutoHideAsync();
// Fade into the first screen instead of cutting. The splash shows the Ministry of Health crest on
// the app's own background, as sign-in does: bare in light mode, on a white disc in dark mode so
// its black lettering stays readable. The images fit Android 12's 192dp circular splash icon.
SplashScreen.setOptions({ fade: true, duration: 300 });

function Shell() {
  const { T, scheme } = useTheme();
  const { restoring } = useSession();
  // Keep the splash up until Inter is ready, so text never jumps from the system font.
  const [fontsReady, fontsSettled] = useAppFonts();
  const waiting = restoring || !fontsSettled;
  useEffect(() => {
    if (!waiting) SplashScreen.hideAsync();
  }, [waiting]);
  if (waiting) return null;
  return (
    <FontsReady.Provider value={fontsReady}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </FontsReady.Provider>
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
