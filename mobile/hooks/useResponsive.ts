import { useWindowDimensions, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Widest the main content column gets; keeps tablets from stretching UI edge to edge. */
export const MAX_CONTENT_WIDTH = 720;
/** Widest a bottom sheet, banner or tab bar gets on tablets. */
export const MAX_SHEET_WIDTH = 600;
/** Widest the sign-in form gets. */
export const MAX_FORM_WIDTH = 480;

/**
 * Screen-size helpers.
 *  - compact: small phones (< 360dp wide)
 *  - tablet:  >= 600dp wide
 *  - short:   < 500dp tall (split screen, landscape windows)
 *  - largeText: system font scale of 1.3 or more
 */
export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  const isCompact = width < 360;
  const isTablet = width >= 600;
  const isShort = height < 500;
  const isLandscape = width > height;
  const largeText = fontScale >= 1.3;
  const gutter = isTablet ? 24 : isCompact ? 12 : 16;

  /** Spread on a container to centre it and cap its width. */
  const contentStyle: ViewStyle = {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  };

  /** Horizontal space left on each side of the capped column (0 on phones). */
  const sideInset = Math.max(0, (width - MAX_CONTENT_WIDTH) / 2);

  return {
    width,
    height,
    fontScale,
    isCompact,
    isTablet,
    isShort,
    isLandscape,
    largeText,
    gutter,
    contentStyle,
    sideInset,
  };
}

/**
 * A centred column capped at `max`, padded so content clears notches and rounded corners
 * at the sides (safe-area insets that the centring margin doesn't already cover).
 */
export function useColumn(max = MAX_CONTENT_WIDTH) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const side = Math.max(0, (width - max) / 2);
  const style: ViewStyle = {
    width: "100%",
    maxWidth: max + Math.max(0, insets.left - side) + Math.max(0, insets.right - side),
    alignSelf: "center",
    paddingLeft: Math.max(0, insets.left - side),
    paddingRight: Math.max(0, insets.right - side),
  };
  /** Distance from the window edge to the column edge, on the right. */
  const right = Math.max(side, insets.right);
  return { style, side, right };
}
