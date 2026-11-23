import TabStack from "@/components/m/TabStack";

// The tab's main screen always sits under a detail page, even when the detail is opened first
// (a link or a reload), so back returns to the tab rather than leaving it.
export const unstable_settings = { initialRouteName: "index" };

export default function Layout() {
  return <TabStack tab="me" />;
}
