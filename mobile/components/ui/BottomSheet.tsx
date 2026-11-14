import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

interface Props {
	visible: boolean;
	title: string;
	onClose: () => void;
	children: React.ReactNode;
	/** Wrap children in a ScrollView (default). Turn off when children scroll themselves (e.g. a FlatList). */
	scroll?: boolean;
}

/** Themed bottom sheet: dimmed backdrop, drag handle, title and close button. Used by every picker. */
const BottomSheet: React.FC<Props> = ({ visible, title, onClose, children, scroll = true }) => {
	const { colors, radius } = useTheme();
	const insets = useSafeAreaInsets();
	const [mounted, setMounted] = useState(visible);
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (visible) {
			setMounted(true);
			Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: true }).start();
		} else if (mounted) {
			Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => finished && setMounted(false));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible]);

	return (
		<Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
			<Animated.View style={{ flex: 1, opacity: progress, backgroundColor: colors.overlay }}>
				<Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
			</Animated.View>
			<Animated.View
				pointerEvents="box-none"
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					bottom: 0,
					alignItems: "center",
					transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }],
				}}
			>
				<View
					style={{
						width: "100%",
						maxWidth: 560,
						maxHeight: "82%",
						backgroundColor: colors.surface,
						borderTopLeftRadius: radius.xl,
						borderTopRightRadius: radius.xl,
						paddingBottom: Math.max(insets.bottom, 16),
					}}
				>
					<View
						style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10 }}
					/>
					<View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 8, paddingTop: 8 }}>
						<AppText variant="heading" style={{ flex: 1 }} accessibilityRole="header">
							{title}
						</AppText>
						<Pressable
							onPress={onClose}
							accessibilityRole="button"
							accessibilityLabel="Close"
							hitSlop={8}
							style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
						>
							<Ionicons name="close" size={24} color={colors.textMuted} />
						</Pressable>
					</View>
					{scroll ? (
						<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
							{children}
						</ScrollView>
					) : (
						children
					)}
				</View>
			</Animated.View>
		</Modal>
	);
};

export default BottomSheet;
