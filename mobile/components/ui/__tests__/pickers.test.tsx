import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppThemeProvider } from "@/context/theme/ThemeProvider";
import { CalendarPicker, ConfirmDialog, MonthYearPicker, WeeklyBars } from "@/components/ui";
import { useConfirm } from "@/hooks/useConfirm";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const wrap = (el: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <AppThemeProvider>{el}</AppThemeProvider>
  </SafeAreaProvider>
);

/** All rendered text joined, so "November"," ","2026" fragments read as one string. */
const textOf = (node: any): string =>
  !node
    ? ""
    : typeof node === "string"
      ? node
      : Array.isArray(node)
        ? node.map(textOf).join("")
        : textOf(node.children);
const render = async (el: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(wrap(el));
  });
  return tree;
};

test("ConfirmDialog shows its content and both actions", async () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const tree = await render(
    <ConfirmDialog
      visible
      title="Log out?"
      message="You'll need to sign in again."
      confirmLabel="Log out"
      cancelLabel="Stay"
      tone="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  const out = textOf(tree.toJSON());
  expect(out).toContain("Log out?");
  expect(out).toContain("Stay");
  const confirmBtn = tree.root
    .findAllByProps({ accessibilityLabel: "Log out" })
    .find((n) => n.props.onPress);
  await act(async () => confirmBtn!.props.onPress());
  expect(onConfirm).toHaveBeenCalled();
});

test("useConfirm resolves true when confirmed and false when cancelled", async () => {
  let api!: ReturnType<typeof useConfirm>;
  const Probe = () => {
    api = useConfirm();
    return <>{api.dialog}</>;
  };
  const tree = await render(<Probe />);

  let result: boolean | undefined;
  await act(async () => {
    api
      .confirm({ title: "Sure?", confirmLabel: "Yes", cancelLabel: "No" })
      .then((v) => (result = v));
  });
  const yes = tree.root.findAllByProps({ accessibilityLabel: "Yes" }).find((n) => n.props.onPress);
  await act(async () => yes!.props.onPress());
  expect(result).toBe(true);

  await act(async () => {
    api
      .confirm({ title: "Sure?", confirmLabel: "Yes", cancelLabel: "No" })
      .then((v) => (result = v));
  });
  const no = tree.root.findAllByProps({ accessibilityLabel: "No" }).find((n) => n.props.onPress);
  await act(async () => no!.props.onPress());
  expect(result).toBe(false);
});

test("CalendarPicker selects a day and blocks days after maxDate", async () => {
  const onSelect = jest.fn();
  const value = new Date(2026, 10, 10); // 10 Nov 2026
  const tree = await render(
    <CalendarPicker value={value} onSelect={onSelect} maxDate={new Date(2026, 10, 14)} />,
  );
  expect(textOf(tree.toJSON())).toContain("November 2026");

  const day12 = tree.root
    .findAllByProps({ accessibilityLabel: new Date(2026, 10, 12).toDateString() })
    .find((n) => n.props.onPress)!;
  await act(async () => day12.props.onPress());
  expect(onSelect.mock.calls[0][0].getDate()).toBe(12);

  const day20 = tree.root
    .findAllByProps({ accessibilityLabel: new Date(2026, 10, 20).toDateString() })
    .find((n) => "disabled" in n.props && n.props.onPress)!;
  expect(day20.props.disabled).toBe(true);
});

test("MonthYearPicker steps months and rolls over the year", async () => {
  const onChange = jest.fn();
  const tree = await render(
    <MonthYearPicker
      value={{ month: 0, year: 2026 }}
      max={{ month: 10, year: 2026 }}
      onChange={onChange}
    />,
  );
  expect(textOf(tree.toJSON())).toContain("January 2026");

  const prev = tree.root
    .findAllByProps({ accessibilityLabel: "Previous month" })
    .find((n) => n.props.onPress)!;
  await act(async () => prev.props.onPress());
  expect(onChange).toHaveBeenCalledWith({ month: 11, year: 2025 });
});

test("MonthYearPicker cannot go past the latest month", async () => {
  const onChange = jest.fn();
  const tree = await render(
    <MonthYearPicker
      value={{ month: 10, year: 2026 }}
      max={{ month: 10, year: 2026 }}
      onChange={onChange}
    />,
  );
  const next = tree.root
    .findAllByProps({ accessibilityLabel: "Next month" })
    .find((n) => n.props.onPress)!;
  expect(next.props.disabled).toBe(true);
});

test("WeeklyBars describes its data for screen readers", async () => {
  const tree = await render(
    <WeeklyBars
      data={[
        { label: "1–7", value: 40 },
        { label: "8–14", value: 0 },
      ]}
    />,
  );
  expect(
    tree.root.findByProps({ accessibilityLabel: "Bar chart. 1–7: 40 pieces, 8–14: 0 pieces" }),
  ).toBeTruthy();
  void Text;
});
