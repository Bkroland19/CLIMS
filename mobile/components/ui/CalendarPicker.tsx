import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const sameDay = (a: Date, b: Date) =>
	a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

interface Props {
	value: Date;
	onSelect: (date: Date) => void;
	maxDate?: Date;
	minDate?: Date;
}

/** Month-grid calendar in the app's own style (same look on Android and iOS). */
const CalendarPicker: React.FC<Props> = ({ value, onSelect, maxDate, minDate }) => {
	const { colors, radius } = useTheme();
	const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
	const today = new Date();

	const first = new Date(view.getFullYear(), view.getMonth(), 1);
	const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
	const cells: (Date | null)[] = [
		...Array(first.getDay()).fill(null),
		...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1)),
	];
	while (cells.length % 7) cells.push(null);

	const disabled = (d: Date) =>
		(maxDate && startOfDay(d) > startOfDay(maxDate)) || (minDate && startOfDay(d) < startOfDay(minDate));
	const canNext = !maxDate || new Date(view.getFullYear(), view.getMonth() + 1, 1) <= startOfDay(maxDate);
	const canPrev = !minDate || new Date(view.getFullYear(), view.getMonth(), 0) >= startOfDay(minDate);
	const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

	const Arrow = ({ dir, enabled }: { dir: -1 | 1; enabled: boolean }) => (
		<Pressable
			onPress={() => shift(dir)}
			disabled={!enabled}
			accessibilityRole="button"
			accessibilityLabel={dir === -1 ? "Previous month" : "Next month"}
			style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: enabled ? 1 : 0.3 }}
		>
			<Ionicons name={dir === -1 ? "chevron-back" : "chevron-forward"} size={22} color={colors.text} />
		</Pressable>
	);

	return (
		<View>
			<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
				<Arrow dir={-1} enabled={canPrev} />
				<AppText variant="bodyStrong" accessibilityLiveRegion="polite">
					{MONTHS[view.getMonth()]} {view.getFullYear()}
				</AppText>
				<Arrow dir={1} enabled={canNext} />
			</View>

			<View style={{ flexDirection: "row", marginTop: 4 }}>
				{WEEKDAYS.map((w, i) => (
					<View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}>
						<AppText variant="caption" color="textMuted">
							{w}
						</AppText>
					</View>
				))}
			</View>

			{Array.from({ length: cells.length / 7 }, (_, row) => (
				<View key={row} style={{ flexDirection: "row" }}>
					{cells.slice(row * 7, row * 7 + 7).map((d, i) => {
						if (!d) return <View key={i} style={{ flex: 1, height: 46 }} />;
						const selected = sameDay(d, value);
						const isToday = sameDay(d, today);
						const off = !!disabled(d);
						return (
							<Pressable
								key={i}
								disabled={off}
								onPress={() => {
									Haptics.selectionAsync().catch(() => {});
									onSelect(d);
								}}
								accessibilityRole="button"
								accessibilityState={{ selected, disabled: off }}
								accessibilityLabel={d.toDateString()}
								style={{ flex: 1, height: 46, alignItems: "center", justifyContent: "center" }}
							>
								<View
									style={{
										width: 40,
										height: 40,
										borderRadius: radius.pill,
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: selected ? colors.brand : "transparent",
										borderWidth: isToday && !selected ? 1.5 : 0,
										borderColor: colors.brand,
									}}
								>
									<AppText
										variant="body"
										style={{
											color: selected ? colors.onBrand : off ? colors.placeholder : colors.text,
											opacity: off ? 0.5 : 1,
											fontFamily: selected ? "Poppins-SemiBold" : "Poppins-Regular",
										}}
									>
										{d.getDate()}
									</AppText>
								</View>
							</Pressable>
						);
					})}
				</View>
			))}
		</View>
	);
};

export default CalendarPicker;
