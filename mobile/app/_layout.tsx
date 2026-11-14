import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppThemeProvider, useTheme } from "@/context/theme/ThemeProvider";
import { OfflineBanner, ToastProvider } from "@/components/ui";

import ReactQueryProvider from "./providers/ReactQueryProvider";
import * as SecureStore from "expo-secure-store";
import GlobalProvider, {
	useGlobalContext,
} from "@/context/auth/GlobalProvider";
import { QueryClient } from "@tanstack/react-query";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: true,
		},
	},
});

/** Bridges our tokens into React Navigation + the status bar. */
function ThemedShell({ children }: { children: React.ReactNode }) {
	const { isDark, colors } = useTheme();
	const base = isDark ? DarkTheme : DefaultTheme;
	return (
		<ThemeProvider
			value={{
				...base,
				colors: {
					...base.colors,
					primary: colors.brand,
					background: colors.bg,
					card: colors.surface,
					text: colors.text,
					border: colors.border,
				},
			}}
		>
			<StatusBar style={isDark ? "light" : "dark"} />
			<ToastProvider>
				{children}
				<OfflineBanner />
			</ToastProvider>
		</ThemeProvider>
	);
}

export default function RootLayout() {
	const [fontsLoaded, error] = useFonts({
		"Poppins-Black": require("../assets/fonts/Poppins-Black.ttf"),
		"Poppins-Bold": require("../assets/fonts/Poppins-Bold.ttf"),
		"Poppins-ExtraBold": require("../assets/fonts/Poppins-ExtraBold.ttf"),
		"Poppins-ExtraLight": require("../assets/fonts/Poppins-ExtraLight.ttf"),
		"Poppins-Light": require("../assets/fonts/Poppins-Light.ttf"),
		"Poppins-Medium": require("../assets/fonts/Poppins-Medium.ttf"),
		"Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
		"Poppins-SemiBold": require("../assets/fonts/Poppins-SemiBold.ttf"),
		"Poppins-Thin": require("../assets/fonts/Poppins-Thin.ttf"),
	});

	useEffect(() => {
		if (error) {
			throw error;
		}

		if (fontsLoaded) {
			SplashScreen.hideAsync();
		}
	}, [fontsLoaded, error]);

	return (
		<GlobalProvider>
			<SafeAreaProvider>
				<AppThemeProvider>
				<ThemedShell>
					<ReactQueryProvider>
						<Stack
							screenOptions={{
								headerShown: false,
							}}
						>
							<Stack.Screen
								name="(tabs)"
								options={{ headerShown: false }}
							/>
							<Stack.Screen
								name="(auth)"
								options={{ headerShown: false }}
							/>
							<Stack.Screen
								name="index"
								options={{ headerShown: false }}
							/>
						</Stack>
					</ReactQueryProvider>
				</ThemedShell>
				</AppThemeProvider>
			</SafeAreaProvider>
		</GlobalProvider>
	);
}
