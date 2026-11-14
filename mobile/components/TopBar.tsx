import React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useCurrentStock } from "@/hooks/useCurrentStock";
import { AppText, Skeleton } from "@/components/ui";

interface Prop {
	/** Slimmer card for places where space is tight. */
	compact?: boolean;
}

/** Hero card showing the stock currently on hand at the rider's hotspot. */
const TopBar: React.FC<Prop> = ({ compact = false }) => {
	const { radius, colors } = useTheme();
	const { stock, isLoading, outOfStock } = useCurrentStock();

	return (
		<View
			style={{
				backgroundColor: outOfStock ? colors.heroDanger : colors.hero,
				borderRadius: radius.xl,
				padding: compact ? 16 : 20,
			}}
		>
			<View style={{ flexDirection: "row", alignItems: "center" }}>
				<View
					style={{
						width: 44,
						height: 44,
						borderRadius: 22,
						backgroundColor: "rgba(255,255,255,0.18)",
						alignItems: "center",
						justifyContent: "center",
						marginRight: 12,
					}}
				>
					<Ionicons name={outOfStock ? "alert" : "cube"} size={22} color="#FFFFFF" />
				</View>
				<AppText variant="label" style={{ color: "#F1FAF2", flex: 1 }}>
					Stock on hand
				</AppText>
				{outOfStock ? (
					<View style={{ backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
						<AppText variant="caption" style={{ color: "#FFFFFF" }}>
							Out of stock
						</AppText>
					</View>
				) : null}
			</View>

			{isLoading ? (
				<Skeleton width={140} height={40} style={{ marginTop: 16, backgroundColor: "rgba(255,255,255,0.25)" }} />
			) : (
				<View
					accessible
					accessibilityLabel={`Stock on hand: ${stock} pieces${outOfStock ? ", out of stock" : ""}`}
					style={{ flexDirection: "row", alignItems: "flex-end", marginTop: compact ? 8 : 12 }}
				>
					<AppText variant="display" style={{ color: "#FFFFFF", fontSize: compact ? 32 : 48, lineHeight: compact ? 40 : 56 }}>
						{stock}
					</AppText>
					<AppText variant="body" style={{ color: "#F1FAF2", marginLeft: 8, marginBottom: 8 }}>
						pieces
					</AppText>
				</View>
			)}
		</View>
	);
};

export default TopBar;
