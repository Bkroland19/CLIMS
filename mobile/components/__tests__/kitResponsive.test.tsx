import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { ThemeProvider } from "@/lib/theme";
import { Hero, Stepper } from "../m/kit";

let mockDims = { width: 400, height: 800, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockDims, scale: 2 }),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const render = async (el: React.ReactElement, dims: Partial<typeof mockDims> = {}) => {
  mockDims = { width: 400, height: 800, fontScale: 1, ...dims };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<ThemeProvider>{el}</ThemeProvider>);
  });
  return tree;
};

const flat = (s: unknown): Record<string, unknown> =>
  Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : ((s as Record<string, unknown>) ?? {});

/** The FieldBox row wrapping the stepper's label and controls. */
const stepperRow = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(
    (n) => (n.type as unknown) === "View" && flat(n.props.style).gap === 12 && !!n.props.children,
  )[0];

const stepper = <Stepper label="Male condoms" value="10" onChange={() => {}} step={10} />;

test("stepper keeps label and controls on one row on regular phones", async () => {
  const tree = await render(stepper, { width: 400 });
  expect(flat(stepperRow(tree)?.props.style).flexDirection).toBe("row");
});

test("stepper stacks its controls under the label on narrow phones", async () => {
  const tree = await render(stepper, { width: 320 });
  expect(stepperRow(tree)).toBeUndefined();
});

test("stepper stacks with large system text", async () => {
  const tree = await render(stepper, { width: 400, fontScale: 1.5 });
  expect(stepperRow(tree)).toBeUndefined();
});

test("hero stat tiles wrap and their numbers shrink to fit", async () => {
  const tree = await render(
    <Hero
      title="Kasangati"
      stats={[
        { label: "Male condoms", value: "12,400" },
        { label: "Female condoms", value: "1,050" },
      ]}
    />,
    { width: 320 },
  );
  const value = tree.root.findAll((n) => n.type === Text && n.props.children === "12,400")[0];
  expect(value.props.adjustsFontSizeToFit).toBe(true);
  expect(value.props.numberOfLines).toBe(1);
  const wrap = tree.root.findAll(
    (n) => (n.type as unknown) === "View" && flat(n.props.style).flexWrap === "wrap",
  );
  expect(wrap.length).toBe(1);
});
