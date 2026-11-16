import React from "react";
import renderer, { act } from "react-test-renderer";
import { AppThemeProvider } from "@/context/theme/ThemeProvider";
import { Badge, Button, EmptyState, Fab, FormModal } from "@/components/ui";
import { Text } from "react-native";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

const wrap = (el: React.ReactElement) => <AppThemeProvider>{el}</AppThemeProvider>;

test("Button fires onPress and is disabled while loading", async () => {
  const onPress = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(wrap(<Button title="Save" onPress={onPress} />));
  });
  const btn = tree.root.findByProps({ accessibilityRole: "button" });
  await act(async () => btn.props.onPress());
  expect(onPress).toHaveBeenCalledTimes(1);

  await act(async () => {
    tree.update(wrap(<Button title="Save" onPress={onPress} loading />));
  });
  expect(tree.root.findByProps({ accessibilityRole: "button" }).props.disabled).toBe(true);
});

test("Badge exposes its status to screen readers", async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(wrap(<Badge label="Active" tone="success" />));
  });
  expect(tree.root.findByProps({ accessibilityLabel: "Status: Active" })).toBeTruthy();
});

test("EmptyState renders title and action", async () => {
  const onAction = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      wrap(<EmptyState title="Nothing here" actionLabel="Add" onAction={onAction} />),
    );
  });
  expect(JSON.stringify(tree.toJSON())).toContain("Nothing here");
});

test("Fab is an accessible button that fires onPress", async () => {
  const onPress = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(wrap(<Fab label="Add stock" onPress={onPress} />));
  });
  const btn = tree.root.findByProps({ accessibilityLabel: "Add stock" });
  await act(async () => btn.props.onPress());
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("FormModal shows its title, content, footer and inline error when open", async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      wrap(
        <FormModal
          visible
          title="Add stock"
          onClose={() => {}}
          error="Please fix the highlighted fields."
          footer={<Text>FOOTER</Text>}
        >
          <Text>BODY</Text>
        </FormModal>,
      ),
    );
  });
  const out = JSON.stringify(tree.toJSON());
  expect(out).toContain("Add stock");
  expect(out).toContain("BODY");
  expect(out).toContain("FOOTER");
  expect(out).toContain("Please fix the highlighted fields.");
});
