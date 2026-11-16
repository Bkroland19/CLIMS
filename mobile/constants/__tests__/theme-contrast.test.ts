import { darkColors, lightColors, ThemeColors } from "../theme";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const pairs: [keyof ThemeColors, keyof ThemeColors][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["textMuted", "surface"],
  ["textMuted", "bg"],
  ["brandText", "surface"],
  ["brandText", "brandSoft"],
  ["onBrand", "brand"],
  ["accent", "surface"],
  ["success", "surface"],
  ["success", "successSoft"],
  ["warning", "surface"],
  ["warning", "warningSoft"],
  ["danger", "surface"],
  ["danger", "dangerSoft"],
  ["textMuted", "brandSoft"],
  ["textMuted", "surfaceAlt"],
  ["placeholder", "surface"],
  ["brandText", "bg"],
];

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
])("%s theme meets WCAG AA (4.5:1)", (_name, c) => {
  test.each(pairs)("%s on %s", (fg, bg) => {
    expect(ratio(c[fg] as string, c[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
])("%s theme hero cards", (_name, c) => {
  test.each([c.hero, c.heroDanger])("white text is readable on %s", (bg) => {
    expect(ratio("#FFFFFF", bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio("#F1FAF2", bg)).toBeGreaterThanOrEqual(4.5);
  });
});

/** Hue in degrees (0-360) of a #rrggbb colour. */
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

// The brand is GREEN (hue ~110-150). Teal/cyan sits around 165-200, so this fails if it drifts back.
describe.each([
  ["light", lightColors],
  ["dark", darkColors],
])("%s theme brand colours are green, not teal", (_name, c) => {
  test.each(["brand", "brandText", "brandSoft", "hero"] as const)("%s", (key) => {
    const h = hue(c[key]);
    expect(h).toBeGreaterThanOrEqual(100);
    expect(h).toBeLessThanOrEqual(150);
  });
});
