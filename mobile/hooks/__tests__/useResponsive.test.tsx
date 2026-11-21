import React from "react";
import renderer, { act } from "react-test-renderer";
import { useColumn, useResponsive, MAX_CONTENT_WIDTH } from "../useResponsive";

let mockDims = { width: 400, height: 800, fontScale: 1 };
let mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockDims, scale: 2 }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));

const probe = async <R,>(hook: () => R, dims: Partial<typeof mockDims> = {}) => {
  mockDims = { width: 400, height: 800, fontScale: 1, ...dims };
  let out!: R;
  const Probe = () => {
    out = hook();
    return null;
  };
  await act(async () => {
    renderer.create(<Probe />);
  });
  return out;
};
const read = (width: number, extra: Partial<typeof mockDims> = {}) =>
  probe(useResponsive, { width, ...extra });

beforeEach(() => {
  mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
});

test("small phones are compact", async () => {
  const r = await read(320);
  expect(r.isCompact).toBe(true);
  expect(r.isTablet).toBe(false);
  expect(r.sideInset).toBe(0);
});

test("tablets cap content width and centre it", async () => {
  const r = await read(1000);
  expect(r.isTablet).toBe(true);
  expect(r.contentStyle.maxWidth).toBe(MAX_CONTENT_WIDTH);
  expect(r.sideInset).toBe((1000 - MAX_CONTENT_WIDTH) / 2);
});

test("short windows and large text are flagged", async () => {
  const r = await read(800, { height: 400, fontScale: 1.4 });
  expect(r.isShort).toBe(true);
  expect(r.isLandscape).toBe(true);
  expect(r.largeText).toBe(true);
});

test("the column pads phones by the side safe areas", async () => {
  mockInsets = { top: 0, bottom: 0, left: 44, right: 20 };
  const c = await probe(() => useColumn(), { width: 400 });
  expect(c.style.paddingLeft).toBe(44);
  expect(c.style.paddingRight).toBe(20);
  expect(c.right).toBe(20);
});

test("the centring margin on tablets already clears the safe areas", async () => {
  mockInsets = { top: 0, bottom: 0, left: 44, right: 44 };
  const c = await probe(() => useColumn(), { width: 1200 });
  expect(c.style.paddingLeft).toBe(0);
  expect(c.style.maxWidth).toBe(MAX_CONTENT_WIDTH);
  expect(c.right).toBe((1200 - MAX_CONTENT_WIDTH) / 2);
});
