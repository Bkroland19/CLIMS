// Reanimated needs a native runtime. Tests only need the pieces the app uses.
jest.mock("react-native-reanimated", () => {
	const { View } = require("react-native");
	const anim = { delay: () => anim, duration: () => anim };
	return { __esModule: true, default: { View }, FadeInDown: anim, FadeIn: anim };
});
