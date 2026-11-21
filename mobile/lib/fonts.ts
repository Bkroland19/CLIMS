import { createContext, useContext } from "react";
import type { TextStyle } from "react-native";
import { useFonts } from "expo-font";

/**
 * Inter, the app's typeface on both platforms: built for screens, with a tall x-height and clear
 * figures for quantities and phone numbers. assets/fonts holds four static weights subset to Latin
 * (with Latin-1 and Latin Extended-A for names) and the punctuation the app uses, about 54 KB each;
 * licence in assets/fonts/OFL.txt.
 */
export const FONT = {
  regular: "Inter-Regular",
  medium: "Inter-Medium",
  semibold: "Inter-SemiBold",
  bold: "Inter-Bold",
} as const;

const BY_WEIGHT: Record<string, string> = {
  "100": FONT.regular,
  "200": FONT.regular,
  "300": FONT.regular,
  "400": FONT.regular,
  normal: FONT.regular,
  "500": FONT.medium,
  "600": FONT.semibold,
  "700": FONT.bold,
  "800": FONT.bold,
  "900": FONT.bold,
  bold: FONT.bold,
};

/** The Inter file for a font weight. Each file is one weight, so text sets the family, not a weight. */
export const fontFor = (weight?: TextStyle["fontWeight"]) =>
  BY_WEIGHT[String(weight ?? "400")] ?? FONT.regular;

/**
 * Slightly tighter tracking as text grows, as Inter's designers recommend for display sizes; body
 * text keeps its natural spacing.
 */
export const trackingFor = (size: number) =>
  size >= 28 ? -0.6 : size >= 20 ? -0.35 : size >= 17 ? -0.2 : 0;

/** True once Inter is loaded. Until then (or if loading fails) the kit uses the system font. */
export const FontsReady = createContext(false);
export const useFontsReady = () => useContext(FontsReady);

/** Load Inter at startup. Resolves to [ready, settled]: settled is true once loading finished or failed. */
export function useAppFonts(): [boolean, boolean] {
  const [loaded, error] = useFonts({
    [FONT.regular]: require("../assets/fonts/Inter-Regular.ttf"),
    [FONT.medium]: require("../assets/fonts/Inter-Medium.ttf"),
    [FONT.semibold]: require("../assets/fonts/Inter-SemiBold.ttf"),
    [FONT.bold]: require("../assets/fonts/Inter-Bold.ttf"),
  });
  return [loaded && !error, loaded || !!error];
}

/**
 * The type scale. Every piece of body-level text uses one of these pairs, so sizes and line
 * spacing line up across screens; platform chrome (large titles, tab and sheet labels) keeps its
 * own native sizes in the kit. Line heights sit on a 2pt grid and give wrapped lines room to read.
 */
export const TYPE = {
  /** Hints, counters, timestamps. */
  caption: { fontSize: 12, lineHeight: 16 },
  /** Field labels, section notes, secondary detail. */
  footnote: { fontSize: 13, lineHeight: 18 },
  /** Supporting lines under a title, banner titles, links. */
  subhead: { fontSize: 15, lineHeight: 20 },
  /** Row text, inputs, paragraphs. */
  body: { fontSize: 16, lineHeight: 22 },
  /** Card and screen titles. */
  title: { fontSize: 20, lineHeight: 26 },
} as const;
