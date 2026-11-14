import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { parseDate } from "@/utils/parseDate";
import { relativeDate } from "@/utils/errors";
import { AppText, Badge, Card } from "@/components/ui";

/** One stock delivery row, shared by Home and Stock. */
const DeliveryCard: React.FC<{ item: any }> = ({ item }) => {
	const { colors } = useTheme();
	const brand = item?.condom_id?.brand;
	const when = item?.date_of_delivery ? relativeDate(parseDate(item.date_of_delivery)) : "";
	const by = item?.person_delivering;

	return (
		<Card
			style={{ flexDirection: "row", alignItems: "center", padding: 14 }}
			accessibilityLabel={`${item?.quantity_brought} pieces${brand ? ` of ${brand}` : ""}, ${when}`}
		>
			<View
				style={{
					width: 44,
					height: 44,
					borderRadius: 14,
					backgroundColor: colors.brandSoft,
					alignItems: "center",
					justifyContent: "center",
					marginRight: 12,
				}}
			>
				<Ionicons name="cube-outline" size={22} color={colors.brandText} />
			</View>
			<View style={{ flex: 1, marginRight: 8 }}>
				<AppText variant="bodyStrong">{item?.quantity_brought} pieces</AppText>
				<AppText variant="caption" color="textMuted" numberOfLines={1}>
					{[brand, when].filter(Boolean).join(" · ")}
				</AppText>
				{by ? (
					<AppText variant="caption" color="textMuted" numberOfLines={1}>
						Delivered by {by}
					</AppText>
				) : null}
			</View>
			<Badge label="Delivered" tone="success" />
		</Card>
	);
};

export default DeliveryCard;
