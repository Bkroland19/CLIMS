import React from "react";
import { ScrollView, StyleProp, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";

interface Props {
	children: React.ReactNode;
	scroll?: boolean;
	padded?: boolean;
	contentStyle?: StyleProp<ViewStyle>;
	refreshControl?: React.ReactElement<any>;
	/** Include bottom safe area (set false on tab screens, the tab bar handles it). */
	bottomInset?: boolean;
}

const Screen: React.FC<Props> = ({
	children,
	scroll = false,
	padded = true,
	contentStyle,
	refreshControl,
	bottomInset = false,
}) => {
	const { colors, spacing } = useTheme();
	const { contentStyle: column, gutter } = useResponsive();
	const pad = padded ? { paddingHorizontal: gutter } : null;

	return (
		<SafeAreaView
			edges={bottomInset ? ["top", "bottom"] : ["top"]}
			style={{ flex: 1, backgroundColor: colors.bg }}
		>
			{scroll ? (
				<ScrollView
					refreshControl={refreshControl}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[
						pad,
						{ paddingBottom: spacing.xxl },
						contentStyle,
					]}
				>
					<View style={column}>{children}</View>
				</ScrollView>
			) : (
				<View style={[{ flex: 1 }, pad, column, contentStyle]}>{children}</View>
			)}
		</SafeAreaView>
	);
};

export default Screen;
