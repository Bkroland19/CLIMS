import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { router, useIsFocused, useNavigation, useSegments, type Href } from "expo-router";
import type { AppRole } from "./types";
import type { IconName } from "@/components/m/Icon";

export type TabKey =
  "hotspots" | "requests" | "dashboard" | "orders" | "deliveries" | "history" | "me";

export const TABS: Record<AppRole, { key: TabKey; label: string; icon: IconName }[]> = {
  vht: [
    { key: "hotspots", label: "Hotspots", icon: "pin" },
    { key: "requests", label: "Requests", icon: "list" },
    { key: "me", label: "Me", icon: "user" },
  ],
  hm: [
    { key: "dashboard", label: "Home", icon: "home" },
    { key: "orders", label: "Orders", icon: "list" },
    { key: "me", label: "Me", icon: "user" },
  ],
  rider: [
    { key: "deliveries", label: "Deliveries", icon: "truck" },
    { key: "history", label: "History", icon: "clock" },
    { key: "me", label: "Me", icon: "user" },
  ],
};

export const ROOT: Record<AppRole, TabKey> = {
  vht: "hotspots",
  hm: "dashboard",
  rider: "deliveries",
};

export const TAB_LABEL: Record<TabKey, string> = {
  hotspots: "Hotspots",
  requests: "Requests",
  dashboard: "Home",
  orders: "Orders",
  deliveries: "Deliveries",
  history: "History",
  me: "Me",
};

/**
 * The tab whose stack a screen lives in, provided by each tab's layout (components/m/TabStack).
 * Screens kept alive in a background tab still know their own tab, so a form that finishes sending
 * after the user moved to another tab navigates inside its own stack rather than the one on show.
 */
export const TabContext = createContext<TabKey | null>(null);

/** A stack screen's own navigator: replace and goBack act on that tab's stack only. */
interface StackNav {
  canGoBack(): boolean;
  goBack(): void;
  replace?: (name: string, params?: object) => void;
}

/**
 * Navigation within the screen's own tab stack. Detail screens live at `/<tab>/<kind>/<id>` (see
 * app/(app)/<tab>/[...path].tsx), so a detail opened from any tab keeps that tab selected.
 */
export function useNav() {
  const own = useContext(TabContext);
  const segs = useSegments() as string[];
  // Outside a tab stack (the push banner) fall back to the tab on show.
  const tab = (own ?? segs[1] ?? "me") as TabKey;
  const navigation = useNavigation() as unknown as StackNav;
  // Whether this screen was on show at its last render. Read through a ref so a callback captured
  // before an await (a form submit) sees the current value when the request comes back.
  const focused = useIsFocused();
  const shown = useRef(focused);
  useEffect(() => {
    shown.current = focused;
  }, [focused]);

  const go = useCallback((path: string) => router.push(`/${tab}/${path}` as Href), [tab]);
  const replace = useCallback(
    (path: string) => {
      // Swap this screen in place within its own stack, without switching the visible tab.
      if (own && navigation.replace) navigation.replace("[...path]", { path: path.split("/") });
      else router.replace(`/${tab}/${path}` as Href);
    },
    [own, navigation, tab],
  );
  const back = useCallback(() => {
    if (own) {
      if (navigation.canGoBack()) navigation.goBack();
      else if (shown.current) router.replace(`/${tab}` as Href);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace(`/${tab}` as Href);
  }, [own, navigation, tab]);
  // Switching tabs after an action only happens if the user is still looking at this screen; a
  // form that finishes in the background must not pull them away from where they went.
  const toTab = useCallback((t: TabKey) => {
    if (shown.current) router.navigate(`/${t}` as Href);
  }, []);
  return useMemo(() => ({ tab, go, replace, back, toTab }), [tab, go, replace, back, toTab]);
}
