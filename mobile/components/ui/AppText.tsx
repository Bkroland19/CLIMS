import React from "react";
import { Text, TextProps } from "react-native";
import { useTheme } from "@/context/theme/ThemeProvider";
import { ColorKey, TextVariant, typography } from "@/constants/theme";

interface Props extends TextProps {
	variant?: TextVariant;
	color?: ColorKey;
}

/** Themed text. Scales with the device font-size setting (accessibility). */
const AppText: React.FC<Props> = ({
	variant = "body",
	color = "text",
	style,
	...props
}) => {
	const { colors } = useTheme();
	return (
		<Text
			maxFontSizeMultiplier={1.4}
			{...props}
			style={[typography[variant], { color: colors[color] }, style]}
		/>
	);
};

export default AppText;
