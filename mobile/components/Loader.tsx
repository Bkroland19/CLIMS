import { View, ActivityIndicator } from "react-native";
import { useTheme } from "@/context/theme/ThemeProvider";

const Loader = ({ isLoading }: any) => {
	const { colors } = useTheme();
	if (!isLoading) return null;

	return (
		<View
			accessibilityRole="progressbar"
			accessibilityLabel="Loading"
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: colors.overlay,
				zIndex: 10,
			}}
		>
			<ActivityIndicator animating size="large" color={colors.brand} />
		</View>
	);
};

export default Loader;
