import { useCallback, useMemo } from "react";
import { router, useSegments, type Href } from "expo-router";
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
 * Navigation within the current tab's stack. Detail screens live at
 * `/<tab>/<kind>/<id>` (see app/(app)/<tab>/[...path].tsx), so a detail opened
 * from any tab keeps that tab selected, as in the design.
 */
export function useNav() {
  const segs = useSegments() as string[];
  const tab = (segs[1] ?? "me") as TabKey;
  const go = useCallback((path: string) => router.push(`/${tab}/${path}` as Href), [tab]);
  const replace = useCallback((path: string) => router.replace(`/${tab}/${path}` as Href), [tab]);
  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`/${tab}` as Href);
  }, [tab]);
  const toTab = useCallback((t: TabKey) => router.navigate(`/${t}` as Href), []);
  return useMemo(() => ({ tab, go, replace, back, toTab }), [tab, go, replace, back, toTab]);
}
