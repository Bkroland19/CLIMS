/**
 * Design tokens. Every colour in the app should come from here (via useTheme),
 * never a hard-coded hex. All text/background pairs meet WCAG AA (>= 4.5:1).
 */

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  brand: string;
  brandText: string;
  brandSoft: string;
  onBrand: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  overlay: string;
  placeholder: string;
  tabBar: string;
  /** Flat fill of the stock card (normal and out-of-stock). White text must stay readable on both. */
  hero: string;
  heroDanger: string;
  /** Categorical chart colours, distinguishable in light/dark. */
  chart: string[];
}

/** Colour keys whose value is a single colour string. */
export type ColorKey = Exclude<keyof ThemeColors, "chart">;

export const lightColors: ThemeColors = {
  bg: "#F3F8F3",
  surface: "#FFFFFF",
  surfaceAlt: "#E6EFE6",
  border: "#D0DDD1",
  text: "#14261A",
  textMuted: "#4A5F4F",
  brand: "#1C8238",
  brandText: "#16692D",
  brandSoft: "#DDF3E1",
  onBrand: "#FFFFFF",
  accent: "#B8500A",
  accentSoft: "#FDEBDD",
  success: "#177338",
  successSoft: "#DDF3E4",
  warning: "#8F5200",
  warningSoft: "#FDF0D5",
  danger: "#C0322B",
  dangerSoft: "#FBE4E2",
  overlay: "rgba(20, 38, 26, 0.45)",
  placeholder: "#5F7363",
  tabBar: "#FFFFFF",
  hero: "#1C8238",
  heroDanger: "#B3372F",
  chart: ["#1C8238", "#E07A1F", "#3F6FD8", "#8E4DB8", "#C0392B", "#B8860B", "#D6457F", "#5B6C7A"],
};

/**
 * Dark mode uses three clearly stepped surfaces (page < card < raised) with a visible hairline
 * border, bright-but-not-neon greens, and a near-black green-tinted neutral, never pure black.
 */
export const darkColors: ThemeColors = {
  bg: "#0C120D",
  surface: "#141B15",
  surfaceAlt: "#1D271F",
  border: "#2F3F32",
  text: "#E7F0E8",
  textMuted: "#A2B5A5",
  brand: "#4CD06E",
  brandText: "#7FE49A",
  brandSoft: "#163020",
  onBrand: "#05200E",
  accent: "#FFA45C",
  accentSoft: "#3A2616",
  success: "#5BD67F",
  successSoft: "#12301C",
  warning: "#F2B24A",
  warningSoft: "#372A10",
  danger: "#FF7B72",
  dangerSoft: "#3B1A18",
  overlay: "rgba(0, 0, 0, 0.65)",
  placeholder: "#7F9583",
  tabBar: "#101712",
  hero: "#1F6B35",
  heroDanger: "#7A2E28",
  chart: ["#4CD06E", "#FFA45C", "#7FA6FF", "#C79BFF", "#FF8F86", "#F2D06B", "#F28BB8", "#9FB3C0"],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Minimum touch target (dp) for field use, one-handed and outdoors. */
export const TOUCH_TARGET = 48;

export const fonts = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semibold: "Poppins-SemiBold",
  bold: "Poppins-Bold",
} as const;

export type TextVariant =
  "display" | "title" | "heading" | "body" | "bodyStrong" | "label" | "caption";

export const typography: Record<
  TextVariant,
  { fontFamily: string; fontSize: number; lineHeight: number }
> = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 40 },
  title: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 30 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
};

export const shadow = (isDark: boolean) => ({
  card: isDark
    ? {}
    : {
        shadowColor: "#14261A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
        elevation: 2,
      },
  raised: isDark
    ? { elevation: 6, shadowColor: "#000" }
    : {
        shadowColor: "#14261A",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
      },
});
