import { Redirect, type Href } from "expo-router";
import { ROOT } from "@/lib/nav";
import { useSession } from "@/lib/session";

/** Entry: signed-in users land on their role's home tab. */
export default function Index() {
  const { user } = useSession();
  if (!user) return <Redirect href="/signin" />;
  return <Redirect href={`/${ROOT[user.role]}` as Href} />;
}
