import React from "react";
import renderer, { act } from "react-test-renderer";
import { useResponsive, MAX_CONTENT_WIDTH } from "../useResponsive";

let mockWidth = 400;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, fontScale: 1, scale: 2 }),
}));

const read = async (width: number) => {
  mockWidth = width;
  let out: any;
  const Probe = () => {
    out = useResponsive();
    return null;
  };
  await act(async () => {
    renderer.create(<Probe />);
  });
  return out;
};

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
