import { Tabs } from "expo-router";
import React from "react";
import { TabBar } from "@/components/ui";

const TabsLayout: React.FC = () => (
	<Tabs
		tabBar={(props) => <TabBar {...props} />}
		screenOptions={{ headerShown: false }}
	>
		<Tabs.Screen name="home" options={{ title: "Home" }} />
		<Tabs.Screen name="stock" options={{ title: "Stock" }} />
		<Tabs.Screen name="hotspot" options={{ title: "Hotspots" }} />
		<Tabs.Screen name="profile" options={{ title: "Profile" }} />
	</Tabs>
);

export default TabsLayout;
