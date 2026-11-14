import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import AppText from "./AppText";

interface Props {
	visible: boolean;
	title: string;
	subtitle?: string;
	/** Called for the close button and Android back; the parent decides whether to confirm discarding. */
	onClose: () => void;
	/** Inline error shown at the top (toasts can't appear above a Modal). */
	error?: string | null;
	footer?: React.ReactNode;
	children: React.ReactNode;
}

/** Full-screen form sheet with close button, scrollable body and a sticky footer. */
const FormModal: React.FC<Props> = ({ visible, title, subtitle, onClose, error, footer, children }) => {
	const { colors, radius } = useTheme();
	const { contentStyle, gutter } = useResponsive();

	return (
		<Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
			<SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
				<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							paddingHorizontal: gutter,
							paddingVertical: 8,
							backgroundColor: colors.surface,
							borderBottomWidth: 1,
							borderBottomColor: colors.border,
						}}
					>
						<Pressable
							onPress={onClose}
							accessibilityRole="button"
							accessibilityLabel="Close form"
							hitSlop={8}
							style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", marginLeft: -8 }}
						>
							<Ionicons name="close" size={26} color={colors.text} />
						</Pressable>
						<View style={{ flex: 1, marginLeft: 4 }}>
							<AppText variant="heading" numberOfLines={1} accessibilityRole="header">
								{title}
							</AppText>
							{subtitle ? (
								<AppText variant="caption" color="textMuted" numberOfLines={1}>
									{subtitle}
								</AppText>
							) : null}
						</View>
					</View>

					<ScrollView
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ padding: gutter, paddingBottom: 24 }}
					>
						<View style={contentStyle}>
							{error ? (
								<View
									accessibilityRole="alert"
									style={{
										flexDirection: "row",
										alignItems: "center",
										backgroundColor: colors.dangerSoft,
										borderWidth: 1,
										borderColor: colors.danger,
										borderRadius: radius.md,
										padding: 12,
										marginBottom: 16,
									}}
								>
									<Ionicons name="alert-circle" size={20} color={colors.danger} />
									<AppText variant="caption" color="danger" style={{ marginLeft: 8, flex: 1 }}>
										{error}
									</AppText>
								</View>
							) : null}
							{children}
						</View>
					</ScrollView>

					{footer ? (
						<View
							style={{
								paddingHorizontal: gutter,
								paddingVertical: 12,
								backgroundColor: colors.surface,
								borderTopWidth: 1,
								borderTopColor: colors.border,
							}}
						>
							<View style={contentStyle}>{footer}</View>
						</View>
					) : null}
				</KeyboardAvoidingView>
			</SafeAreaView>
		</Modal>
	);
};

export default FormModal;
