import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { tokensFor, type Scheme, type Tokens } from "@/constants/design";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeCtx {
  T: Tokens;
  mode: ThemeMode;
  scheme: Scheme;
  setMode: (m: ThemeMode) => void;
}

const KEY = "clims.theme.v1";
const Ctx = createContext<ThemeCtx | null>(null);

/** Light, dark or follow the phone. The choice is kept on this phone. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setModeState(v);
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  }, []);

  const scheme: Scheme = mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
  const value = useMemo(() => ({ T: tokensFor(scheme), mode, scheme, setMode }), [scheme, mode, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}

/** The active design tokens. */
export const useT = () => useTheme().T;
