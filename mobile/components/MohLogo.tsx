import React from "react";
import { Image, View } from "react-native";
import { images } from "@/constants";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { AppText } from "@/components/ui";

/**
 * Ministry of Health, Republic of Uganda identity: the official coat of arms on a white
 * plate (so it stays legible in dark mode) with the ministry name in large, theme-aware text.
 */
const MohLogo: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
	const { colors, shadows } = useTheme();
	const { isCompact } = useResponsive();
	const small = compact || isCompact;
	const plate = small ? 96 : 120;
	const crest = plate - 24;

	return (
		<View accessible accessibilityRole="image" accessibilityLabel="Ministry of Health, Republic of Uganda" style={{ alignItems: "center" }}>
			<View
				style={{
					width: plate,
					height: plate,
					borderRadius: plate / 2,
					backgroundColor: "#FFFFFF",
					alignItems: "center",
					justifyContent: "center",
					borderWidth: 1,
					borderColor: colors.border,
					...shadows.card,
				}}
			>
				<Image source={images.coatOfArms} style={{ width: crest, height: crest }} resizeMode="contain" />
			</View>
			<AppText
				variant="heading"
				maxFontSizeMultiplier={1.2}
				style={{ marginTop: 12, textAlign: "center", fontFamily: "Poppins-Bold", fontSize: small ? 18 : 21, lineHeight: small ? 24 : 28, letterSpacing: 1.2 }}
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
