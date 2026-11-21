import React from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "@/lib/theme";
import { FONT, FontsReady, fontFor, trackingFor } from "@/lib/fonts";
import { Input, Txt } from "../m/kit";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const trees: renderer.ReactTestRenderer[] = [];
const render = async (el: React.ReactElement, fonts = true) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider>
          <FontsReady.Provider value={fonts}>{el}</FontsReady.Provider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  trees.push(tree);
  return tree;
};
afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach((t) => t.unmount());
  });
});

const styleOf = (node: renderer.ReactTestInstance) => StyleSheet.flatten(node.props.style);

describe("fonts", () => {
  it("maps each weight to its own Inter file", () => {
    expect(fontFor("400")).toBe(FONT.regular);
    expect(fontFor(undefined)).toBe(FONT.regular);
    expect(fontFor("500")).toBe(FONT.medium);
    expect(fontFor("600")).toBe(FONT.semibold);
    expect(fontFor("700")).toBe(FONT.bold);
    expect(fontFor("bold")).toBe(FONT.bold);
  });

  it("tightens tracking only at display sizes", () => {
    expect(trackingFor(15)).toBe(0);
    expect(trackingFor(20)).toBeLessThan(0);
    expect(trackingFor(30)).toBeLessThan(trackingFor(20));
  });
});

describe("Txt", () => {
  it("uses the Inter file for the weight and never a synthesised weight", async () => {
    const tree = await render(<Txt style={{ fontWeight: "600", fontSize: 16 }}>Hi</Txt>);
    const style = styleOf(tree.root.findByType(Text));
    expect(style.fontFamily).toBe(FONT.semibold);
    expect(style.fontWeight).toBe("normal");
  });

  it("falls back to the system font until Inter has loaded", async () => {
    const tree = await render(<Txt style={{ fontWeight: "600" }}>Hi</Txt>, false);
    const style = styleOf(tree.root.findByType(Text));
    expect(style.fontFamily).toBeUndefined();
    expect(style.fontWeight).toBe("600");
  });
});

describe("Input", () => {
  it("counts characters in a text area with a limit", async () => {
    const tree = await render(
      <Input label="Comment" value="Busy" onChangeText={() => {}} multiline max={2000} />,
    );
    const texts = tree.root.findAllByType(Text).map((n) => String(n.props.children));
    expect(texts).toContain("4/2000");
    expect(tree.root.findByType(TextInput).props.maxLength).toBe(2000);
  });

  it("highlights a focused field's label in the brand colour", async () => {
    const tree = await render(<Input label="Name" value="" onChangeText={() => {}} />);
    const label = () =>
      styleOf(tree.root.findAll((n) => n.type === Text && n.props.children === "Name")[0]);
    const before = label().color;
    await act(async () => tree.root.findByType(TextInput).props.onFocus());
    expect(label().color).not.toBe(before);
    expect(styleOf(tree.root.findByType(TextInput)).fontFamily).toBe(FONT.regular);
  });
});
