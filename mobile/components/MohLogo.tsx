import React from "react";
import { Image, View } from "react-native";
import { images } from "@/constants";
import { useResponsive } from "@/hooks/useResponsive";
import { AppText } from "@/components/ui";

/**
 * Ministry of Health, Republic of Uganda identity: the ministry's seal (the coat of arms in
 * its own white field, so it stays legible in dark mode) with the ministry name in large,
 * theme-aware text.
 */
const MohLogo: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isCompact } = useResponsive();
  const small = compact || isCompact;
  const seal = small ? 96 : 120;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Ministry of Health, Republic of Uganda"
      style={{ alignItems: "center" }}
    >
      <Image source={images.mohSeal} style={{ width: seal, height: seal }} resizeMode="contain" />
      <AppText
        variant="heading"
        maxFontSizeMultiplier={1.2}
        style={{
          marginTop: 12,
          textAlign: "center",
          fontFamily: "Poppins-Bold",
          fontSize: small ? 18 : 21,
          lineHeight: small ? 24 : 28,
          letterSpacing: 1.2,
        }}
      >
        MINISTRY OF HEALTH
      </AppText>
      <AppText
        variant="label"
        color="danger"
        maxFontSizeMultiplier={1.2}
        style={{ textAlign: "center", fontFamily: "Poppins-SemiBold", letterSpacing: 1.6 }}
      >
        REPUBLIC OF UGANDA
      </AppText>
    </View>
  );
};

export default MohLogo;
