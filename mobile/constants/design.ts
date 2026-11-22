import { Platform } from "react-native";

/**
 * Design tokens for the field app, from the CLIMS mobile design.
 * iOS follows Apple's grouped-list style; Android follows Material 3 with a green scheme.
 * Each has a light and a dark palette. Components read the active one with `useT()`
 * (lib/theme.tsx), so never hard-code a colour in a screen.
 */

type ToneSet = Record<
  "info" | "success" | "warning" | "danger" | "neutral",
  { fg: string; bg: string; icon: string }
>;

export interface Tokens {
  ios: boolean;
  dark: boolean;
  bg: string;
  fg: string;
  fg2: string;
  fg3: string;
  tint: string;
  sep: string;
  hdrBg: string;
  hdrBd: string;
  danger: string;
  rowBg: string;
  rowPress: string;
  dot: string;
  listGap: number;
  listR: number;
  rowPy: number;
  rowMin: number;
  rowFs: number;
  icBox: number;
  icR: number;
  icBg: string;
  icFg: string;
  inactiveIcBg: string;
  dangerIcBg: string;
  dangerIcFg: string;
  shUpper: boolean;
  shFs: number;
  shFg: string;
  shFw: "400" | "500";
  shPx: number;
  fRowBg: string;
  fGap: number;
  inH: number;
  inR: number;
  inBd: string;
  inBw: number;
  /** Text field fill: clear on light pages, a slightly lifted well on dark ones. */
  inBg: string;
  outline: string;
  roBg: string;
  placeholder: string;
  stepperBg: string;
  stepperInBg: string;
  switchOn: string;
  switchOff: string;
  switchThumbOff?: string;
  cardBg: string;
  cardR: number;
  tileBg: string;
  /** Skeleton loader placeholder. */
  skelBg: string;
  tileR: number;
  imgBg: string;
  secGap: number;
  srH: number;
  srR: number;
  srBg: string;
  btnH: number;
  btnR: number;
  btnFs: number;
  btnFw: "500" | "600";
  b1Bg: string;
  b1Fg: string;
  b2Bg: string;
  b2Fg: string;
  b2Bw: number;
  b2Bd: string;
  sheetBg: string;
  sheetR: number;
  scrim: string;
  grab: string;
  tabBg: string;
  tabBd: string;
  tabActive: string;
  tabIdle: string;
  /** Pill behind the selected tab's icon. */
  tabPill: string;
  chipR: number;
  segBg: string;
  segOn: string;
  segH: number;
  segR: number;
  stepWarnBg: string;
  warnFg: string;
  warnBd: string;
  offBg: string;
  fabBg: string;
  fabPress: string;
  fabFg: string;
  pushBg: string;
  /** Ministry green behind the tab roots' header band, and the text on it. */
  brand: string;
  brandFg: string;
  brandFg2: string;
  brandPress: string;
  /** Hairline edge around cards and grouped lists, so white surfaces read on a light page. */
  cardBd: string;
  /** Stock meter track. */
  meterBg: string;
  map: { bg: string; road: string; road2: string; block: string; water: string; pin: string };
  tones: ToneSet;
}

const lightTones: ToneSet = {
  info: { fg: "#0a5f8a", bg: "rgba(10,106,155,0.10)", icon: "info" },
  success: { fg: "#177534", bg: "rgba(23,117,52,0.10)", icon: "checkC" },
  warning: { fg: "#9a4505", bg: "rgba(168,76,6,0.10)", icon: "alert" },
  danger: { fg: "#b3261e", bg: "rgba(198,40,40,0.09)", icon: "alert" },
  neutral: { fg: "#42493f", bg: "rgba(66,73,63,0.08)", icon: "info" },
};

const darkTones: ToneSet = {
  info: { fg: "#8ccdf5", bg: "rgba(124,196,240,0.15)", icon: "info" },
  success: { fg: "#86dca0", bg: "rgba(127,217,154,0.15)", icon: "checkC" },
  warning: { fg: "#f6bb80", bg: "rgba(245,183,122,0.15)", icon: "alert" },
  danger: { fg: "#ffb4ab", bg: "rgba(255,180,171,0.15)", icon: "alert" },
  neutral: { fg: "#c6ccc1", bg: "rgba(194,200,189,0.12)", icon: "info" },
};

const lightMap = {
  bg: "#e8efe1",
  road: "#ffffff",
  road2: "#fdf6e3",
  block: "#d6e4cc",
  water: "#cfe0f2",
  pin: "#c62828",
};
const darkMap = {
  bg: "#1f261d",
  road: "#3a4237",
  road2: "#4a4630",
  block: "#2a3427",
  water: "#1f3346",
  pin: "#ff6b5e",
};

export const iosLight: Tokens = {
  ios: true,
  dark: false,
  bg: "#f2f2f7",
  fg: "#000000",
  fg2: "#5f5f64",
  fg3: "#aeaeb2",
  tint: "#1c7c34",
  sep: "rgba(60,60,67,0.18)",
  hdrBg: "#f2f2f7",
  hdrBd: "rgba(0,0,0,0.14)",
  danger: "#d70015",
  rowBg: "#ffffff",
  rowPress: "#e5e5ea",
  dot: "#007aff",
  listGap: 0,
  listR: 10,
  rowPy: 10,
  rowMin: 44,
  rowFs: 16,
  icBox: 30,
  icR: 7,
  icBg: "#1c7c34",
  icFg: "#ffffff",
  inactiveIcBg: "#c7c7cc",
  dangerIcBg: "#d70015",
  dangerIcFg: "#ffffff",
  shUpper: true,
  shFs: 12,
  shFg: "#5f5f64",
  shFw: "400",
  shPx: 32,
  fRowBg: "#ffffff",
  fGap: 0,
  inH: 32,
  inR: 0,
  inBd: "transparent",
  inBw: 0,
  inBg: "transparent",
  outline: "#72796f",
  roBg: "transparent",
  placeholder: "#8e8e93",
  stepperBg: "rgba(118,118,128,0.12)",
  stepperInBg: "rgba(118,118,128,0.08)",
  switchOn: "#34c759",
  switchOff: "rgba(120,120,128,0.16)",
  cardBg: "#ffffff",
  cardR: 12,
  tileBg: "#f2f2f7",
  skelBg: "rgba(60,60,67,0.13)",
  tileR: 10,
  imgBg: "#dddddd",
  secGap: 18,
  srH: 36,
  srR: 10,
  srBg: "rgba(118,118,128,0.12)",
  btnH: 50,
  btnR: 12,
  btnFs: 16,
  btnFw: "600",
  b1Bg: "#1c7c34",
  b1Fg: "#ffffff",
  b2Bg: "rgba(28,124,52,0.12)",
  b2Fg: "#1c7c34",
  b2Bw: 0,
  b2Bd: "transparent",
  sheetBg: "#f2f2f7",
  sheetR: 12,
  scrim: "rgba(0,0,0,0.32)",
  grab: "#c7c7cc",
  tabBg: "rgba(249,249,249,0.97)",
  tabBd: "rgba(0,0,0,0.2)",
  tabActive: "#1c7c34",
  tabIdle: "#8e8e93",
  tabPill: "rgba(29,107,44,0.13)",
  chipR: 6,
  segBg: "rgba(118,118,128,0.12)",
  segOn: "#ffffff",
  segH: 32,
  segR: 9,
  stepWarnBg: "#fdeee2",
  warnFg: "#9a4505",
  warnBd: "#a84c06",
  offBg: "#fdeee2",
  fabBg: "#c3ecbd",
  fabPress: "#b5dcae",
  fabFg: "#062b0f",
  pushBg: "rgba(246,246,246,0.97)",
  brand: "#14532d",
  brandFg: "#ffffff",
  brandFg2: "rgba(255,255,255,0.74)",
  brandPress: "rgba(255,255,255,0.14)",
  cardBd: "rgba(60,60,67,0.08)",
  meterBg: "rgba(118,118,128,0.16)",
  map: lightMap,
  tones: lightTones,
};

export const iosDark: Tokens = {
  ...iosLight,
  dark: true,
  bg: "#000000",
  fg: "#ffffff",
  fg2: "#a1a1a8",
  fg3: "#636366",
  tint: "#30d158",
  sep: "rgba(84,84,88,0.6)",
  hdrBg: "#000000",
  hdrBd: "rgba(255,255,255,0.14)",
  danger: "#ff453a",
  rowBg: "#1c1c1e",
  rowPress: "#2c2c2e",
  dot: "#0a84ff",
  icBg: "#1f7a35",
  icFg: "#ffffff",
  inactiveIcBg: "#48484a",
  dangerIcBg: "#d70015",
  shFg: "#a1a1a8",
  fRowBg: "#1c1c1e",
  outline: "#8c9388",
  placeholder: "#636366",
  stepperBg: "rgba(118,118,128,0.24)",
  stepperInBg: "rgba(118,118,128,0.18)",
  switchOff: "rgba(120,120,128,0.32)",
  cardBg: "#1c1c1e",
  tileBg: "#2c2c2e",
  skelBg: "rgba(235,235,245,0.13)",
  imgBg: "#2c2c2e",
  srBg: "rgba(118,118,128,0.24)",
  b1Bg: "#1f7a35",
  b1Fg: "#ffffff",
  b2Bg: "rgba(48,209,88,0.16)",
  b2Fg: "#30d158",
  sheetBg: "#111113",
  scrim: "rgba(0,0,0,0.55)",
  grab: "#48484a",
  tabBg: "rgba(22,22,24,0.97)",
  tabBd: "rgba(255,255,255,0.12)",
  tabActive: "#30d158",
  tabIdle: "#8e8e93",
  tabPill: "rgba(48,209,88,0.18)",
  segBg: "rgba(118,118,128,0.24)",
  segOn: "#636366",
  stepWarnBg: "#3a2616",
  warnFg: "#f6bb80",
  warnBd: "#f6bb80",
  offBg: "#3a2616",
  fabBg: "#1f5129",
  fabPress: "#2a6535",
  fabFg: "#a6f4a3",
  pushBg: "rgba(44,44,46,0.97)",
  brand: "#12301c",
  brandFg: "#eef5ea",
  brandFg2: "rgba(238,245,234,0.7)",
  brandPress: "rgba(255,255,255,0.1)",
  cardBd: "rgba(255,255,255,0.06)",
  meterBg: "rgba(118,118,128,0.3)",
  map: darkMap,
  tones: darkTones,
};

export const mdLight: Tokens = {
  ios: false,
  dark: false,
  bg: "#f2f4ef",
  fg: "#191c18",
  fg2: "#4a5247",
  fg3: "#72796f",
  tint: "#1d6b2c",
  sep: "#dfe4da",
  hdrBg: "#f2f4ef",
  hdrBd: "transparent",
  danger: "#ba1a1a",
  rowBg: "#ffffff",
  rowPress: "#eef2ea",
  dot: "#1d6b2c",
  listGap: 0,
  listR: 16,
  rowPy: 10,
  rowMin: 52,
  rowFs: 15,
  icBox: 40,
  icR: 20,
  icBg: "#e2f0dd",
  icFg: "#062b0f",
  inactiveIcBg: "#c7c7cc",
  dangerIcBg: "#ffdad6",
  dangerIcFg: "#410002",
  shUpper: false,
  shFs: 13,
  shFg: "#4a5247",
  shFw: "500",
  shPx: 28,
  fRowBg: "transparent",
  fGap: 8,
  inH: 46,
  inR: 14,
  // Fields are soft filled wells with no outline, like the segmented control; focus and errors
  // show as a gentle tinted ring (see inputStyle).
  inBd: "transparent",
  inBw: 0,
  // As far from the page as dark mode's fields are from theirs (about 1.2:1), so both read alike.
  inBg: "#d9e1d2",
  outline: "#72796f",
  roBg: "#e4e9de",
  placeholder: "#5d6459",
  stepperBg: "#ccd5c4",
  stepperInBg: "#d9e1d2",
  switchOn: "#1d6b2c",
  switchOff: "#e0e4da",
  switchThumbOff: "#72796f",
  cardBg: "#ffffff",
  cardR: 16,
  tileBg: "#f4f6f1",
  skelBg: "rgba(66,73,63,0.13)",
  tileR: 12,
  imgBg: "#dddddd",
  secGap: 16,
  srH: 46,
  srR: 26,
  srBg: "#ffffff",
  btnH: 48,
  btnR: 24,
  btnFs: 15,
  btnFw: "500",
  b1Bg: "#1d6b2c",
  b1Fg: "#ffffff",
  b2Bg: "#cbe6c3",
  b2Fg: "#1d6b2c",
  b2Bw: 0,
  b2Bd: "transparent",
  sheetBg: "#f7f8f5",
  sheetR: 28,
  scrim: "rgba(0,0,0,0.32)",
  grab: "#72796f",
  tabBg: "#ffffff",
  tabBd: "transparent",
  tabActive: "#1d6b2c",
  tabIdle: "#42493f",
  tabPill: "#d3ecce",
  chipR: 8,
  segBg: "#d9e1d2",
  segOn: "#ffffff",
  segH: 40,
  segR: 20,
  stepWarnBg: "#fdeee2",
  warnFg: "#9a4505",
  warnBd: "#a84c06",
  offBg: "#fdeee2",
  fabBg: "#1d6b2c",
  fabPress: "#175a24",
  fabFg: "#ffffff",
  pushBg: "#ffffff",
  brand: "#14532d",
  brandFg: "#ffffff",
  brandFg2: "rgba(255,255,255,0.74)",
  brandPress: "rgba(255,255,255,0.14)",
  cardBd: "#e1e6dc",
  meterBg: "#e6eae2",
  map: lightMap,
  tones: lightTones,
};

export const mdDark: Tokens = {
  ...mdLight,
  dark: true,
  // Layered greens, darkest at the page and lighter as surfaces rise (card, sheet, toast), so
  // depth reads through brightness rather than shadows. The brand green stays deep and solid.
  bg: "#0a0e0a",
  fg: "#e6ebe2",
  fg2: "#a9b3a5",
  fg3: "#788274",
  tint: "#6fd08a",
  sep: "#232a22",
  hdrBg: "#0a0e0a",
  danger: "#ff8a80",
  rowBg: "#131913",
  rowPress: "#1b231b",
  dot: "#6fd08a",
  icBg: "#16301e",
  icFg: "#7fd696",
  inactiveIcBg: "#232b22",
  dangerIcBg: "#3a1614",
  dangerIcFg: "#ffb4ab",
  shFg: "#8f9a8b",
  inBd: "transparent",
  inBg: "#1b231b",
  outline: "#3d473b",
  roBg: "#171e17",
  stepperBg: "#262f25",
  stepperInBg: "#1b231b",
  placeholder: "#6f796c",
  switchOn: "#3fae5c",
  switchOff: "#252d24",
  switchThumbOff: "#7a8477",
  cardBg: "#131913",
  tileBg: "#0e130e",
  skelBg: "rgba(255,255,255,0.07)",
  imgBg: "#1b231b",
  srBg: "#151b15",
  b1Bg: "#2f8f4a",
  b1Fg: "#ffffff",
  b2Bg: "#1d3d26",
  b2Fg: "#7fd696",
  b2Bd: "transparent",
  sheetBg: "#171e17",
  scrim: "rgba(0,0,0,0.65)",
  grab: "#788274",
  tabBg: "#0f140f",
  tabActive: "#6fd08a",
  tabIdle: "#a9b3a5",
  tabPill: "#1d3d26",
  segBg: "#1b231b",
  segOn: "#1d3d26",
  stepWarnBg: "#2b1d12",
  warnFg: "#f6bb80",
  warnBd: "#f6bb80",
  offBg: "#2b1d12",
  fabBg: "#2f8f4a",
  fabPress: "#287c40",
  fabFg: "#ffffff",
  pushBg: "#1a221a",
  brand: "#11301c",
  brandFg: "#eef5ea",
  brandFg2: "rgba(238,245,234,0.7)",
  brandPress: "rgba(255,255,255,0.1)",
  cardBd: "rgba(255,255,255,0.07)",
  meterBg: "rgba(255,255,255,0.08)",
  map: darkMap,
  tones: darkTones,
};

export type Scheme = "light" | "dark";

export const tokensFor = (scheme: Scheme): Tokens =>
  Platform.OS === "ios"
    ? scheme === "dark"
      ? iosDark
      : iosLight
    : scheme === "dark"
      ? mdDark
      : mdLight;
