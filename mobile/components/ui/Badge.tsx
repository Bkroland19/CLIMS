import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "brand";

const ICONS: Record<BadgeTone, keyof typeof Ionicons.glyphMap> = {
	success: "checkmark-circle",
	warning: "alert-circle",
	danger: "close-circle",
	neutral: "ellipse-outline",
	brand: "information-circle",
};

/** Status chip. Always icon + text, never colour alone (colour-blind safe). */
const Badge: React.FC<{ label: string; tone?: BadgeTone }> = ({
	label,
	tone = "neutral",
}) => {
	const { colors, radius } = useTheme();
	const map = {
		success: [colors.successSoft, colors.success],
		warning: [colors.warningSoft, colors.warning],
		danger: [colors.dangerSoft, colors.danger],
		brand: [colors.brandSoft, colors.brandText],
		neutral: [colors.surfaceAlt, colors.textMuted],
	}[tone];

	return (
		<View
			accessible
			accessibilityLabel={`Status: ${label}`}
			style={{
				flexDirection: "row",
				alignItems: "center",
				alignSelf: "flex-start",
				backgroundColor: map[0],
				paddingHorizontal: 10,
				paddingVertical: 4,
				borderRadius: radius.pill,
			}}
		>
			<Ionicons name={ICONS[tone]} size={14} color={map[1]} />
			<AppText variant="caption" style={{ color: map[1], marginLeft: 4 }}>
				{label}
			</AppText>
		</View>
	);
};

export default Badge;
