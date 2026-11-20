import { Stack } from "expo-router";
import { useT } from "@/lib/theme";

export default function Layout() {
  const T = useT();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }} />;
}
