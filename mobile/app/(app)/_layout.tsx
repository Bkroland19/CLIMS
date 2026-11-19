import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useT } from "@/lib/theme";
import PushBanner from "@/components/m/PushBanner";
import TabBar from "@/components/m/TabBar";
import { useSession } from "@/lib/session";
import { StoreProvider, useStore } from "@/lib/store";

const TAB_ROUTES = ["hotspots", "requests", "dashboard", "orders", "deliveries", "history", "reports", "me"];

function Signed() {
  const T = useT();
  const { ready } = useStore();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: T.bg }}>
        <ActivityIndicator color={T.tint} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      {/* Every role's tabs are registered; TabBar shows only the signed-in role's. */}
      <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
        {TAB_ROUTES.map((n) => (
          <Tabs.Screen key={n} name={n} />
        ))}
      </Tabs>
      <PushBanner />
    </View>
  );
}

export default function AppLayout() {
  const { user } = useSession();
  if (!user) return <Redirect href="/signin" />;
  return (
    <StoreProvider key={user.id}>
      <Signed />
    </StoreProvider>
  );
}
