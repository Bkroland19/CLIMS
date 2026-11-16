import React from "react";
import renderer, { act } from "react-test-renderer";
import { AppThemeProvider } from "@/context/theme/ThemeProvider";
import StockActions from "../StockActions";

let mockOut = false;
jest.mock("@/hooks/useCurrentStock", () => ({
  useCurrentStock: () => ({ stock: mockOut ? 0 : 25, isLoading: false, outOfStock: mockOut }),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

const textOf = (node: any): string =>
  !node
    ? ""
    : typeof node === "string"
      ? node
      : Array.isArray(node)
        ? node.map(textOf).join("")
        : textOf(node.children);

const render = async (props: React.ComponentProps<typeof StockActions>) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <AppThemeProvider>
        <StockActions {...props} />
      </AppThemeProvider>,
    );
  });
  return tree;
};

const button = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAllByProps({ accessibilityLabel: label }).find((n) => n.props.onPress)!;

test("normal stock: shows Add stock and a calm 'Running low?' alert action", async () => {
  mockOut = false;
  const onAdd = jest.fn();
  const onNotify = jest.fn();
  const tree = await render({ onAdd, onNotify });
  const out = textOf(tree.toJSON());
  expect(out).toContain("Add stock");
  expect(out).toContain("Running low?");

  await act(async () => button(tree, "Add stock. Record a delivery").props.onPress());
  await act(async () =>
    button(tree, "Running low? Notify the district focal person").props.onPress(),
  );
  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(onNotify).toHaveBeenCalledTimes(1);
});

test("out of stock: the alert becomes a prominent 'Out of stock' action", async () => {
  mockOut = true;
  const onNotify = jest.fn();
  const tree = await render({ onNotify });
  const out = textOf(tree.toJSON());
  expect(out).toContain("Out of stock");
  expect(out).not.toContain("Running low?");
  expect(out).not.toContain("Add stock"); // notify-only layout
  await act(async () =>
    button(tree, "Out of stock. Notify the district focal person").props.onPress(),
  );
  expect(onNotify).toHaveBeenCalledTimes(1);
});
