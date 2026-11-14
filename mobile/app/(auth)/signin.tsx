import React, { useRef, useState } from "react";
import { router } from "expo-router";
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import MohLogo from "@/components/MohLogo";
import { LoginData, LoginResponse, login } from "../api/auth";
import { useGlobalContext } from "@/context/auth/GlobalProvider";
import { useTheme } from "@/context/theme/ThemeProvider";
import { AppText, Button, Input } from "@/components/ui";
import { friendlyError } from "@/utils/errors";

const SignIn = () => {
	const queryClient = useQueryClient();
	const { setIsLogged, setUser } = useGlobalContext();
	const { colors, radius } = useTheme();
	const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);

	const [form, setForm] = useState<LoginData>({ username: "", password: "" });
	const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
	const [serverError, setServerError] = useState<string | null>(null);

	const { mutate, isPending } = useMutation<LoginResponse, Error, LoginData>({
		mutationFn: login,
		onSuccess: async (data) => {
			queryClient.setQueryData(["login"], data);
			queryClient.invalidateQueries({ queryKey: ["login"], exact: true });

			if (data.code === 200) {
				await SecureStore.setItemAsync("user", JSON.stringify(data?.user));
				setIsLogged(true);
				setUser(data.user);
				router.replace("/home");
			} else {
				setServerError("Incorrect username or password. Please try again.");
			}
		},
		onError: (error) => {
			setServerError(friendlyError(error, "We couldn't sign you in. Please try again."));
		},
	});

	const submit = () => {
		setServerError(null);
		const next: typeof errors = {};
		if (!form.username.trim()) next.username = "Enter your username";
		if (!form.password) next.password = "Enter your password";
		setErrors(next);
		if (Object.keys(next).length) return;

		mutate(form);
	};

	return (
		<View style={{ flex: 1, backgroundColor: colors.bg }}>
			<SafeAreaView style={{ flex: 1 }}>
				<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
					<ScrollView
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ flexGrow: 1, padding: 24 }}
					>
						<View style={{ flex: 1, width: "100%", maxWidth: 480, alignSelf: "center", justifyContent: "space-between" }}>
							<View>
								{/* Back to the welcome screen */}
								<Pressable
									onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
									accessibilityRole="button"
									accessibilityLabel="Go back"
									hitSlop={8}
									style={{ width: 48, height: 48, justifyContent: "center", marginLeft: -12 }}
								>
									<Ionicons name="arrow-back" size={24} color={colors.text} />
								</Pressable>

								<View style={{ marginTop: 4 }}>
									<MohLogo />
								</View>

								<AppText variant="display" style={{ marginTop: 28 }} accessibilityRole="header">
									Welcome back
								</AppText>
								<AppText variant="body" color="textMuted" style={{ marginTop: 6 }}>
									Sign in to manage your hotspot's stock.
								</AppText>

								{/* Form sits directly on the page (no card) */}
								<View style={{ marginTop: 32 }}>
									{serverError ? (
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
												marginBottom: 20,
											}}
										>
											<Ionicons name="alert-circle" size={20} color={colors.danger} />
											<AppText variant="caption" color="danger" style={{ marginLeft: 8, flex: 1 }}>
												{serverError}
											</AppText>
										</View>
									) : null}

									<Input
										label="Username"
										icon="person-outline"
										value={form.username}
										onChangeText={(v) => setForm({ ...form, username: v })}
										error={errors.username}
										autoCapitalize="none"
										autoCorrect={false}
										textContentType="username"
										returnKeyType="next"
										onSubmitEditing={() => passwordRef.current?.focus()}
									/>

									<Input
										ref={passwordRef}
										label="Password"
										icon="lock-closed-outline"
										secure
										value={form.password}
										onChangeText={(v) => setForm({ ...form, password: v })}
										error={errors.password}
										autoCapitalize="none"
										textContentType="password"
										returnKeyType="go"
										onSubmitEditing={submit}
										containerStyle={{ marginTop: 20 }}
									/>

									<Button title="Sign in" onPress={submit} loading={isPending} style={{ marginTop: 28 }} />

									<Pressable
										onPress={() => router.push("/help")}
										accessibilityRole="link"
										accessibilityLabel="Need help signing in? Open Help and support"
										style={{ minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 8 }}
									>
										<AppText variant="label" color="brandText">
											Need help signing in?
										</AppText>
									</Pressable>
								</View>
							</View>

							{/* Footer stays at the bottom on tall screens, flows below on short ones */}
							<View style={{ marginTop: 32, alignItems: "center" }}>
								<AppText variant="caption" color="textMuted" style={{ textAlign: "center" }}>
									By signing in you agree to the{" "}
									<AppText
										variant="caption"
										color="brandText"
										accessibilityRole="link"
										onPress={() => router.push("/terms")}
										style={{ textDecorationLine: "underline" }}
									>
										Terms & conditions
									</AppText>
								</AppText>
							</View>
						</View>
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</View>
	);
};

export default SignIn;
