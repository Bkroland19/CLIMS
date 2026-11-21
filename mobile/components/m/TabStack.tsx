import React from "react";
import { Stack } from "expo-router";
import { useT } from "@/lib/theme";
import { TabContext, type TabKey } from "@/lib/nav";

/** One tab's stack: its main screen, then detail pages pushed on top. */
export default function TabStack({ tab }: { tab: TabKey }) {
  const T = useT();
  return (
    <TabContext.Provider value={tab}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }} />
    </TabContext.Provider>
  );
}
