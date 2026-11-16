import { ScrollView, View } from "react-native";
import { Redirect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import MohLogo from "@/components/MohLogo";
import { useGlobalContext } from "@/context/auth/GlobalProvider";
import { useTheme } from "@/context/theme/ThemeProvider";
import Loader from "@/components/Loader";
import { AppText, Button } from "@/components/ui";
import { useResponsive } from "@/hooks/useResponsive";

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: "cube-outline", text: "Track condom stock" },
  { icon: "cart-outline", text: "Order when stock runs out" },
  { icon: "location-outline", text: "Map new hotspots" },
];

export default function App() {
  const { loading, isLogged } = useGlobalContext();
  const { colors } = useTheme();
  const { isCompact } = useResponsive();

  if (!loading && isLogged) return <Redirect href="/home" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Loader isLoading={loading} />
      <SafeAreaView
        style={{
          flex: 1,
          paddingHorizontal: isCompact ? 16 : 24,
          width: "100%",
          maxWidth: 520,
          alignSelf: "center",
        }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <MohLogo />

            <AppText
              variant="display"
              style={{
                marginTop: 40,
                fontSize: isCompact ? 26 : 30,
                lineHeight: isCompact ? 34 : 40,
              }}
            >
              Last mile{"\n"}
              <AppText
                variant="display"
                color="brandText"
                style={{ fontSize: isCompact ? 26 : 30, lineHeight: isCompact ? 34 : 40 }}
              >
                condom distribution,
              </AppText>{" "}
              made simple.
            </AppText>

            <View style={{ marginTop: 20 }}>
              {FEATURES.map((f) => (
                <View
                  key={f.text}
                  style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: colors.brandSoft,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Ionicons name={f.icon} size={18} color={colors.brandText} />
                  </View>
                  <AppText variant="body" color="textMuted" style={{ flex: 1 }}>
                    {f.text}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>

        <Button
          title="Get started"
          icon="arrow-forward"
          onPress={() => router.push("/signin")}
          style={{ marginBottom: 16 }}
        />
      </SafeAreaView>
    </View>
  );
}
