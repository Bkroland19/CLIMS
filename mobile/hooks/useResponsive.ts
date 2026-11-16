import { useWindowDimensions, ViewStyle } from "react-native";

/** Widest the main content column gets; keeps tablets from stretching UI edge to edge. */
export const MAX_CONTENT_WIDTH = 720;

/**
 * Screen-size helpers.
 *  - compact: small phones (< 360dp wide)
 *  - tablet:  >= 600dp wide
 */
export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  const isCompact = width < 360;
  const isTablet = width >= 600;
  const gutter = isTablet ? 24 : isCompact ? 12 : 16;

  /** Spread on a container to centre it and cap its width. */
  const contentStyle: ViewStyle = {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  };

  /** Horizontal space left on each side of the capped column (0 on phones). */
  const sideInset = Math.max(0, (width - MAX_CONTENT_WIDTH) / 2);

  return { width, height, fontScale, isCompact, isTablet, gutter, contentStyle, sideInset };
}
