import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";
import BottomSheet from "./BottomSheet";
import CalendarPicker from "./CalendarPicker";

interface Props {
	label: string;
	/** Text shown in the field (already formatted), empty when nothing chosen. */
	display: string;
	date: Date;
	onChange: (date: Date) => void;
	error?: string;
	maximumDate?: Date;
	minimumDate?: Date;
}

/** Date field that opens the app's own calendar sheet (identical on Android and iOS). */
const DateField: React.FC<Props> = ({ label, display, date, onChange, error, maximumDate, minimumDate }) => {
	const { colors, radius } = useTheme();
	const [open, setOpen] = useState(false);

	return (
		<View>
			<AppText variant="label" color="textMuted" style={{ marginBottom: 6 }}>
				{label}
			</AppText>
			<Pressable
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${display || "not selected"}`}
				style={{
					flexDirection: "row",
					alignItems: "center",
					minHeight: 56,
					paddingHorizontal: 14,
					backgroundColor: colors.surface,
					borderRadius: radius.md,
					borderWidth: error ? 2 : 1.5,
					borderColor: error ? colors.danger : colors.border,
				}}
			>
				<Ionicons name="calendar-outline" size={20} color={colors.textMuted} style={{ marginRight: 10 }} />
				<AppText variant="body" color={display ? "text" : "placeholder"} style={{ flex: 1 }}>
					{display || "Tap to choose a date"}
				</AppText>
				<Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
			</Pressable>
			{error ? (
				<View style={{ flexDirection: "row", marginTop: 6, alignItems: "center" }}>
					<Ionicons name="alert-circle" size={16} color={colors.danger} />
					<AppText variant="caption" color="danger" style={{ marginLeft: 6, flex: 1 }}>
						{error}
					</AppText>
				</View>
			) : null}

			<BottomSheet visible={open} title={label} onClose={() => setOpen(false)}>
				<CalendarPicker
					value={date}
					maxDate={maximumDate}
					minDate={minimumDate}
					onSelect={(d) => {
						onChange(d);
						setOpen(false);
					}}
				/>
			</BottomSheet>
		</View>
	);
};

export default DateField;
