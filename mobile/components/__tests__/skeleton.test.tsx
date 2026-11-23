import React from "react";
import { Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@/lib/theme";
import { Select, SkeletonList } from "../m/kit";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const trees: renderer.ReactTestRenderer[] = [];
const render = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider>{el}</ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  trees.push(tree);
  return tree;
};
// Unmount so the skeleton's pulse animation stops between tests.
afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach((t) => t.unmount());
  });
});

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => n.type === Text).map((n) => String(n.props.children));

test("skeleton list is announced as loading", async () => {
  const tree = await render(<SkeletonList rows={3} />);
  const busy = tree.root.findAll(
    (n) => n.props.accessibilityRole === "progressbar" && n.props.accessibilityLabel === "Loading",
  );
  expect(busy.length).toBeGreaterThan(0);
});

test("a loading select shows a skeleton instead of an empty field", async () => {
  const props = { label: "Region", value: "", options: [], onChange: () => {} };
  const loading = await render(<Select {...props} loading />);
  expect(texts(loading)).toContain("Region");
  expect(texts(loading)).not.toContain("Choose…");
  const ready = await render(<Select {...props} />);
  expect(texts(ready)).toContain("Choose…");
});
