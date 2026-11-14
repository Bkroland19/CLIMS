import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";
import Card from "./Card";

interface Props {
	label: string;
	value: string | number;
	icon: keyof typeof Ionicons.glyphMap;
	tone?: "brand" | "accent" | "success" | "warning" | "danger";
	unit?: string;
	/** Tinted background with the number in the tone colour (no border). */
	soft?: boolean;
}

const StatTile: React.FC<Props> = ({ label, value, icon, tone = "brand", unit, soft = false }) => {
	const { colors } = useTheme();
	const fg = { brand: colors.brandText, accent: colors.accent, success: colors.success, warning: colors.warning, danger: colors.danger }[tone];
	const bg = { brand: colors.brandSoft, accent: colors.accentSoft, success: colors.successSoft, warning: colors.warningSoft, danger: colors.dangerSoft }[tone];

	return (
		<Card style={{ flex: 1, ...(soft ? { backgroundColor: bg, borderWidth: 0, elevation: 0, shadowOpacity: 0 } : null) }} accessibilityLabel={`${label}: ${value} ${unit ?? ""}`}>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: 12,
					backgroundColor: soft ? "rgba(255,255,255,0.55)" : bg,
					alignItems: "center",
					justifyContent: "center",
					marginBottom: 12,
				}}
			>
				<Ionicons name={icon} size={22} color={fg} />
			</View>
			<AppText variant="title" style={soft ? { color: fg, fontSize: 28, lineHeight: 36 } : undefined}>
				{value}
			</AppText>
			<AppText variant="caption" color="textMuted">
				{unit ? `${label} (${unit})` : label}
			</AppText>
		</Card>
	);
};

export default StatTile;
