import React, { useState } from "react";
import {
	Pressable,
	TextInput,
	TextInputProps,
	View,
	StyleProp,
	ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { TOUCH_TARGET, fonts } from "@/constants/theme";
import AppText from "./AppText";

interface Props extends TextInputProps {
	label: string;
	error?: string;
	hint?: string;
	icon?: keyof typeof Ionicons.glyphMap;
	secure?: boolean;
	containerStyle?: StyleProp<ViewStyle>;
}

const Input = React.forwardRef<React.ComponentRef<typeof TextInput>, Props>(({
	label,
	error,
	hint,
	icon,
	secure = false,
	multiline,
	containerStyle,
	...props
}, ref) => {
	const { colors, radius } = useTheme();
	const [focused, setFocused] = useState(false);
	const [hidden, setHidden] = useState(true);

	const borderColor = error
		? colors.danger
		: focused
		? colors.brand
		: colors.border;

	return (
		<View style={containerStyle}>
			<AppText variant="label" color="textMuted" style={{ marginBottom: 6 }}>
				{label}
			</AppText>
			<View
				style={{
					flexDirection: "row",
					alignItems: multiline ? "flex-start" : "center",
					minHeight: TOUCH_TARGET + 8,
					paddingHorizontal: 14,
					backgroundColor: colors.surface,
					borderRadius: radius.md,
					borderWidth: focused || error ? 2 : 1.5,
					borderColor,
				}}
			>
				{icon ? (
					<Ionicons
						name={icon}
						size={20}
						color={focused ? colors.brand : colors.textMuted}
						style={{ marginRight: 10, marginTop: multiline ? 14 : 0 }}
					/>
				) : null}
				<TextInput
					ref={ref}
					{...props}
					multiline={multiline}
					accessibilityLabel={label}
					secureTextEntry={secure && hidden}
					placeholderTextColor={colors.placeholder}
					onFocus={(e) => {
						setFocused(true);
						props.onFocus?.(e);
					}}
					onBlur={(e) => {
						setFocused(false);
						props.onBlur?.(e);
					}}
					style={{
						flex: 1,
						fontFamily: fonts.regular,
						fontSize: 16,
						color: colors.text,
						paddingVertical: multiline ? 14 : 12,
						minHeight: multiline ? 96 : undefined,
						textAlignVertical: multiline ? "top" : "center",
					}}
				/>
				{secure ? (
					<Pressable
						onPress={() => setHidden((h) => !h)}
						hitSlop={12}
						accessibilityRole="button"
						accessibilityLabel={hidden ? "Show password" : "Hide password"}
					>
						<Ionicons
							name={hidden ? "eye-outline" : "eye-off-outline"}
							size={22}
							color={colors.textMuted}
						/>
					</Pressable>
				) : null}
			</View>
			{error ? (
				<View style={{ flexDirection: "row", marginTop: 6, alignItems: "center" }}>
					<Ionicons name="alert-circle" size={16} color={colors.danger} />
					<AppText variant="caption" color="danger" style={{ marginLeft: 6, flex: 1 }}>
						{error}
					</AppText>
				</View>
			) : hint ? (
				<AppText variant="caption" color="textMuted" style={{ marginTop: 6 }}>
					{hint}
				</AppText>
			) : null}
		</View>
	);
});
Input.displayName = "Input";

export default Input;
