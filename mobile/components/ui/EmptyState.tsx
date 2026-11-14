import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";
import Button from "./Button";

interface Props {
	icon?: keyof typeof Ionicons.glyphMap;
	title: string;
	message?: string;
	actionLabel?: string;
	onAction?: () => void;
}

const EmptyState: React.FC<Props> = ({
	icon = "file-tray-outline",
	title,
	message,
	actionLabel,
	onAction,
}) => {
	const { colors } = useTheme();
	return (
		<View style={{ alignItems: "center", padding: 32 }}>
			<View
				style={{
					width: 88,
					height: 88,
					borderRadius: 44,
					backgroundColor: colors.brandSoft,
					alignItems: "center",
					justifyContent: "center",
					marginBottom: 16,
				}}
			>
				<Ionicons name={icon} size={40} color={colors.brandText} />
			</View>
			<AppText variant="heading" style={{ textAlign: "center" }}>
				{title}
			</AppText>
			{message ? (
				<AppText variant="body" color="textMuted" style={{ textAlign: "center", marginTop: 6 }}>
					{message}
				</AppText>
			) : null}
			{actionLabel && onAction ? (
				<Button title={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: 20 }} />
			) : null}
		</View>
	);
};

export default EmptyState;
