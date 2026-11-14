import React from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleProp,
	View,
	ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { TOUCH_TARGET } from "@/constants/theme";
import AppText from "./AppText";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface Props {
	title: string;
	onPress: () => void;
	variant?: ButtonVariant;
	loading?: boolean;
	disabled?: boolean;
	icon?: keyof typeof Ionicons.glyphMap;
	style?: StyleProp<ViewStyle>;
	accessibilityLabel?: string;
}

const Button: React.FC<Props> = ({
	title,
	onPress,
	variant = "primary",
	loading = false,
	disabled = false,
	icon,
	style,
	accessibilityLabel,
}) => {
	const { colors, radius } = useTheme();
	const inactive = disabled || loading;

	const palette = {
		primary: { bg: colors.brand, fg: colors.onBrand, border: colors.brand },
		secondary: {
			bg: colors.brandSoft,
			fg: colors.brandText,
			border: colors.brandSoft,
		},
		ghost: { bg: "transparent", fg: colors.brandText, border: colors.border },
		danger: { bg: colors.danger, fg: "#FFFFFF", border: colors.danger },
	}[variant];

	return (
		<Pressable
			onPress={() => {
				Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
					() => {}
				);
				onPress();
			}}
			disabled={inactive}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? title}
			accessibilityState={{ disabled: inactive, busy: loading }}
			style={({ pressed }) => [
				{
					minHeight: TOUCH_TARGET + 8,
					borderRadius: radius.lg,
					paddingHorizontal: 20,
					backgroundColor: palette.bg,
					borderWidth: variant === "ghost" ? 1.5 : 0,
					borderColor: palette.border,
					alignItems: "center",
					justifyContent: "center",
					flexDirection: "row",
					opacity: inactive ? 0.55 : 1,
					transform: [{ scale: pressed ? 0.98 : 1 }],
				},
				style,
			]}
		>
			{loading ? (
				<ActivityIndicator color={palette.fg} />
			) : (
				<View style={{ flexDirection: "row", alignItems: "center" }}>
					{icon ? (
						<Ionicons
							name={icon}
							size={20}
							color={palette.fg}
							style={{ marginRight: 8 }}
						/>
					) : null}
					<AppText
						variant="bodyStrong"
						style={{ color: palette.fg }}
					>
						{title}
					</AppText>
				</View>
			)}
		</Pressable>
	);
};

export default Button;
