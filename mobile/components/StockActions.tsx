import React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useCurrentStock } from "@/hooks/useCurrentStock";
import { AppText } from "@/components/ui";

interface Props {
	/** Quick "Add stock" action. Omit to show only the notify action (full width). */
	onAdd?: () => void;
	onNotify: () => void;
}

/**
 * Quick actions that sit directly under the stock card, so they are visible the moment the
 * screen opens: record a delivery, or alert the focal person. At zero stock the alert turns
 * into a solid, unmissable red call to action.
 */
const StockActions: React.FC<Props> = ({ onAdd, onNotify }) => {
	const { colors, radius } = useTheme();
	const { outOfStock } = useCurrentStock();

	const press = (fn: () => void) => () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
		fn();
	};

	const Action = ({
		icon,
		label,
		sub,
		onPress,
		bg,
		fg,
		border,
		a11y,
	}: {
		icon: keyof typeof Ionicons.glyphMap;
		label: string;
		sub?: string;
		onPress: () => void;
		bg: string;
		fg: string;
		border?: string;
		a11y: string;
	}) => (
		<Pressable
			onPress={press(onPress)}
			accessibilityRole="button"
			accessibilityLabel={a11y}
			style={({ pressed }) => ({
				flex: 1,
				minHeight: 64,
				flexDirection: "row",
				alignItems: "center",
				paddingHorizontal: 14,
				paddingVertical: 10,
				borderRadius: radius.lg,
				backgroundColor: bg,
				borderWidth: border ? 1 : 0,
				borderColor: border,
				opacity: pressed ? 0.85 : 1,
			})}
		>
			<View
				style={{
					width: 36,
					height: 36,
					borderRadius: 18,
					backgroundColor: "rgba(255,255,255,0.22)",
					alignItems: "center",
					justifyContent: "center",
					marginRight: 10,
				}}
			>
				<Ionicons name={icon} size={20} color={fg} />
			</View>
			<View style={{ flex: 1 }}>
				<AppText variant="bodyStrong" numberOfLines={2} style={{ color: fg, lineHeight: 20 }}>
					{label}
				</AppText>
				{sub ? (
					<AppText variant="caption" numberOfLines={1} style={{ color: fg, opacity: 0.85 }}>
						{sub}
					</AppText>
				) : null}
			</View>
		</Pressable>
	);

	return (
		<View style={{ flexDirection: "row", gap: 12 }}>
			{onAdd ? (
				<Action
					icon="add-circle"
					label="Add stock"
					sub="Record a delivery"
					onPress={onAdd}
					bg={colors.brandSoft}
					fg={colors.brandText}
					a11y="Add stock. Record a delivery"
				/>
			) : null}
			{outOfStock ? (
				<Action
					icon="notifications"
					label="Out of stock"
					sub="Notify focal person"
					onPress={onNotify}
					bg={colors.danger}
					fg="#FFFFFF"
					a11y="Out of stock. Notify the district focal person"
				/>
			) : (
				<Action
					icon="notifications-outline"
					label="Running low?"
					sub="Notify focal person"
					onPress={onNotify}
					bg={colors.warningSoft}
					fg={colors.warning}
					border={colors.warning}
					a11y="Running low? Notify the district focal person"
				/>
			)}
		</View>
	);
};

export default StockActions;
