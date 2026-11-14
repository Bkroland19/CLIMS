import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import AppText from "./AppText";

interface Props {
	label: string;
	icon?: keyof typeof Ionicons.glyphMap;
	onPress: () => void;
}

/** Floating action button, pinned bottom-right above the tab bar. Label hides on very narrow screens. */
const Fab: React.FC<Props> = ({ label, icon = "add", onPress }) => {
	const { colors, radius, shadows } = useTheme();
	const { isCompact, sideInset, gutter } = useResponsive();

	return (
		<Pressable
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
				onPress();
			}}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => ({
				position: "absolute",
				right: sideInset + gutter,
				bottom: gutter + 4,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				minHeight: 56,
				minWidth: 56,
				paddingHorizontal: isCompact ? 16 : 20,
				borderRadius: radius.pill,
				backgroundColor: colors.brand,
				transform: [{ scale: pressed ? 0.96 : 1 }],
				...shadows.raised,
			})}
		>
			<Ionicons name={icon} size={24} color={colors.onBrand} />
			{isCompact ? null : (
				<AppText variant="bodyStrong" style={{ color: colors.onBrand, marginLeft: 8 }}>
					{label}
				</AppText>
			)}
		</Pressable>
	);
};

export default Fab;
