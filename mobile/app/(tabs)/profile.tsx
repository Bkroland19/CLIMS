import React from "react";
import { View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useGlobalContext } from "@/context/auth/GlobalProvider";
import { ThemeMode, useTheme } from "@/context/theme/ThemeProvider";
import Constants from "expo-constants";
import { AppText, Badge, Button, Card, SegmentedControl } from "@/components/ui";
import { useResponsive } from "@/hooks/useResponsive";
import { useConfirm } from "@/hooks/useConfirm";

type IconName = keyof typeof Ionicons.glyphMap;

const InfoRow: React.FC<{ icon: IconName; label: string; value?: string | null; last?: boolean }> = ({
	icon,
	label,
	value,
	last,
}) => {
	const { colors } = useTheme();
	return (
		<View
			accessible
			accessibilityLabel={`${label}: ${value || "not provided"}`}
			style={{
				flexDirection: "row",
				alignItems: "center",
				paddingVertical: 12,
				borderBottomWidth: last ? 0 : 1,
				borderBottomColor: colors.border,
			}}
		>
			<Ionicons name={icon} size={20} color={colors.textMuted} />
			<View style={{ marginLeft: 12, flex: 1 }}>
				<AppText variant="caption" color="textMuted">
					{label}
				</AppText>
				<AppText variant="body">{value || "Not provided"}</AppText>
			</View>
		</View>
	);
};

const ActionRow: React.FC<{
	icon: IconName;
	title: string;
	subtitle: string;
	onPress: () => void;
	last?: boolean;
}> = ({ icon, title, subtitle, onPress, last }) => {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${title}. ${subtitle}`}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				minHeight: 64,
				borderBottomWidth: last ? 0 : 1,
				borderBottomColor: colors.border,
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<View
				style={{
					width: 40,
					height: 40,
					borderRadius: 12,
					backgroundColor: colors.brandSoft,
					alignItems: "center",
					justifyContent: "center",
					marginRight: 12,
				}}
			>
				<Ionicons name={icon} size={20} color={colors.brandText} />
			</View>
			<View style={{ flex: 1 }}>
				<AppText variant="bodyStrong">{title}</AppText>
				<AppText variant="caption" color="textMuted">
					{subtitle}
				</AppText>
			</View>
			<Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
		</Pressable>
	);
};

const Profile: React.FC = () => {
	const { setIsLogged, user, setUser } = useGlobalContext();
	const { colors, mode, setMode } = useTheme();
	const { contentStyle, gutter } = useResponsive();
	const { confirm, dialog } = useConfirm();

	const handleLogout = async () => {
		await SecureStore.deleteItemAsync("user");
		setIsLogged(false);
		setUser(null);
		router.replace("/");
	};

	const confirmLogout = async () => {
		const ok = await confirm({
			title: "Log out?",
			message: "You'll need to sign in again to use the app.",
			confirmLabel: "Log out",
			cancelLabel: "Stay signed in",
			tone: "danger",
			icon: "log-out",
		});
		if (ok) handleLogout();
	};

	const initials = `${user?.firstname?.charAt(0) || ""}${user?.lastname?.charAt(0) || ""}`.toUpperCase();

	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={[contentStyle, { padding: gutter, paddingBottom: 32 }]}
			>
				{/* Header */}
				<View style={{ alignItems: "center", paddingVertical: 16 }}>
					<View
						accessibilityElementsHidden
						style={{
							width: 96,
							height: 96,
							borderRadius: 48,
							backgroundColor: colors.brand,
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<AppText variant="display" style={{ color: colors.onBrand }}>
							{initials || "?"}
						</AppText>
					</View>
					<AppText variant="title" style={{ marginTop: 12 }}>
						{user?.firstname} {user?.lastname}
					</AppText>
					<AppText variant="body" color="textMuted">
						Hotspot manager
					</AppText>
					<View style={{ marginTop: 8 }}>
						<Badge label="Active" tone="success" />
					</View>
				</View>

				{/* Personal */}
				<Card>
					<AppText variant="heading" style={{ marginBottom: 4 }}>
						Personal information
					</AppText>
					<InfoRow icon="mail-outline" label="Email" value={user?.email} />
					<InfoRow icon="call-outline" label="Phone" value={user?.phone_number} last />
				</Card>

				{/* Location */}
				<Card style={{ marginTop: 16 }}>
					<AppText variant="heading" style={{ marginBottom: 4 }}>
						Hotspot
					</AppText>
					<InfoRow icon="business-outline" label="Hotspot name" value={user?.hotspot?.name || "Not assigned"} />
					<InfoRow icon="earth-outline" label="Region" value={user?.region || "Not specified"} />
					<InfoRow icon="location-outline" label="District" value={user?.hotspot?.district || "Not specified"} last />
				</Card>

				{/* Appearance */}
				<Card style={{ marginTop: 16 }}>
					<AppText variant="heading">Appearance</AppText>
					<AppText variant="caption" color="textMuted" style={{ marginTop: 2, marginBottom: 12 }}>
						{mode === "system"
							? "Following your phone's light or dark setting."
							: `Always ${mode} mode.`}
					</AppText>
					<SegmentedControl<ThemeMode>
						options={[
							{ value: "system", label: "System" },
							{ value: "light", label: "Light" },
							{ value: "dark", label: "Dark" },
						]}
						value={mode}
						onChange={setMode}
					/>
				</Card>

				{/* Support & legal */}
				<Card style={{ marginTop: 16, paddingVertical: 4 }}>
					<ActionRow
						icon="help-circle-outline"
						title="Help & support"
						subtitle="Answers to common questions and how to reach us"
						onPress={() => router.push("/help")}
					/>
					<ActionRow
						icon="document-text-outline"
						title="Terms & conditions"
						subtitle="How the app may be used and how your data is handled"
						onPress={() => router.push("/terms")}
						last
					/>
				</Card>

				<Button
					title="Log out"
					icon="log-out-outline"
					variant="ghost"
					onPress={confirmLogout}
					style={{ marginTop: 24, borderColor: colors.danger }}
				/>
				<AppText variant="caption" color="textMuted" style={{ textAlign: "center", marginTop: 20 }}>
					Ministry of Health, Uganda · Version {Constants.expoConfig?.version ?? "1.0.0"}
				</AppText>
			</ScrollView>
			{dialog}
		</SafeAreaView>
	);
};

export default Profile;
