import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
	ThemeColors,
	darkColors,
	lightColors,
	radius,
	shadow,
	spacing,
} from "@/constants/theme";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
	/** The user's choice. "system" (default) follows the device live. */
	mode: ThemeMode;
	setMode: (mode: ThemeMode) => void;
	isDark: boolean;
	colors: ThemeColors;
	spacing: typeof spacing;
	radius: typeof radius;
	shadows: ReturnType<typeof shadow>;
}

const STORAGE_KEY = "theme_mode";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const systemScheme = useColorScheme();
	const [mode, setModeState] = useState<ThemeMode>("system");

	useEffect(() => {
		SecureStore.getItemAsync(STORAGE_KEY)
			.then((saved) => {
				if (saved === "light" || saved === "dark" || saved === "system") {
					setModeState(saved);
				}
			})
			.catch(() => {});
	}, []);

	const setMode = useCallback((next: ThemeMode) => {
		setModeState(next);
		SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
	}, []);

	const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";

	const value = useMemo<ThemeContextValue>(
		() => ({
			mode,
			setMode,
			isDark,
			colors: isDark ? darkColors : lightColors,
			spacing,
			radius,
			shadows: shadow(isDark),
		}),
		[mode, setMode, isDark]
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
};

export const useTheme = (): ThemeContextValue => {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used inside AppThemeProvider");
	return ctx;
};
