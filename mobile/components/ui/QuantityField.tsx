import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import { TOUCH_TARGET, fonts } from "@/constants/theme";
import AppText from "./AppText";

interface Props {
	label: string;
	value: number | null | undefined;
	onChange: (value: number) => void;
	error?: string;
	hint?: string;
	onBlur?: () => void;
	/** Shortcut chips, e.g. [10, 50, 100] adds that many. */
	quickAdds?: number[];
}

/** Number input with − / + steppers so riders rarely need the keyboard. */
const QuantityField: React.FC<Props> = ({ label, value, onChange, error, hint, onBlur, quickAdds }) => {
	const { colors, radius } = useTheme();
	const [focused, setFocused] = useState(false);
	const current = value ?? 0;

	const step = (delta: number) => {
		Haptics.selectionAsync().catch(() => {});
		onChange(Math.max(0, current + delta));
	};

	const StepButton = ({ icon, delta, name }: { icon: "remove" | "add"; delta: number; name: string }) => (
		<Pressable
			onPress={() => step(delta)}
			accessibilityRole="button"
			accessibilityLabel={`${name} ${label}`}
			style={({ pressed }) => ({
				width: TOUCH_TARGET + 8,
				height: TOUCH_TARGET + 8,
				alignItems: "center",
				justifyContent: "center",
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<Ionicons name={icon} size={24} color={colors.brandText} />
		</Pressable>
	);

	return (
		<View>
			<AppText variant="label" color="textMuted" style={{ marginBottom: 6 }}>
				{label}
			</AppText>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					backgroundColor: colors.surface,
					borderRadius: radius.md,
					borderWidth: focused || error ? 2 : 1.5,
					borderColor: error ? colors.danger : focused ? colors.brand : colors.border,
				}}
			>
				<StepButton icon="remove" delta={-1} name="Decrease" />
				<TextInput
					value={current ? String(current) : ""}
					placeholder="0"
					placeholderTextColor={colors.placeholder}
					keyboardType="number-pad"
					accessibilityLabel={label}
					onChangeText={(t) => onChange(Number(t.replace(/[^0-9]/g, "")))}
					onFocus={() => setFocused(true)}
					onBlur={() => {
						setFocused(false);
						onBlur?.();
					}}
					style={{
						flex: 1,
						textAlign: "center",
						fontFamily: fonts.semibold,
						fontSize: 20,
						color: colors.text,
						paddingVertical: 10,
					}}
				/>
				<StepButton icon="add" delta={1} name="Increase" />
			</View>
			{quickAdds?.length ? (
				<View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
					{quickAdds.map((n) => (
						<Pressable
							key={n}
							onPress={() => step(n)}
							accessibilityRole="button"
							accessibilityLabel={`Add ${n} to ${label}`}
							style={{
								minHeight: 40,
								paddingHorizontal: 14,
								marginRight: 8,
								marginBottom: 4,
								alignItems: "center",
								justifyContent: "center",
								borderRadius: radius.pill,
								backgroundColor: colors.brandSoft,
							}}
						>
							<AppText variant="label" color="brandText">
								+{n}
							</AppText>
						</Pressable>
					))}
				</View>
			) : null}
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
};

export default QuantityField;
