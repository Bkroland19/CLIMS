import React from "react";
import renderer, { act } from "react-test-renderer";
import { AppThemeProvider } from "@/context/theme/ThemeProvider";
import { FaqItem } from "@/components/ui";
import { FAQS, SUPPORT_EMAIL, TERMS } from "@/constants/legal";

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

test("FaqItem hides its answer until tapped, then toggles it", async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <AppThemeProvider>
        <FaqItem question="How do I add stock?" answer="Open the Stock tab." />
      </AppThemeProvider>,
    );
  });
  expect(textOf(tree.toJSON())).not.toContain("Open the Stock tab.");

  const btn = tree.root
    .findAllByProps({ accessibilityLabel: "How do I add stock?" })
    .find((n) => n.props.onPress)!;
  await act(async () => btn.props.onPress());
  expect(textOf(tree.toJSON())).toContain("Open the Stock tab.");

  await act(async () => btn.props.onPress());
  expect(textOf(tree.toJSON())).not.toContain("Open the Stock tab.");
});

describe("help and legal content", () => {
  test("every FAQ has a question and an answer", () => {
    expect(FAQS.length).toBeGreaterThan(5);
    FAQS.forEach((f) => {
      expect(f.q.trim()).not.toBe("");
      expect(f.a.trim().length).toBeGreaterThan(20);
    });
  });

  test("terms are numbered in order and every section has text", () => {
    TERMS.forEach((s, i) => {
      expect(s.title.startsWith(`${i + 1}.`)).toBe(true);
      expect(s.body.length).toBeGreaterThan(0);
    });
  });

  test("terms name the Ministry's governing law and the privacy act", () => {
    const all = TERMS.map((s) => s.body.join(" ")).join(" ");
    expect(all).toMatch(/Republic of Uganda/);
    expect(all).toMatch(/Data Protection and Privacy Act, 2019/);
  });

  test("support email looks valid", () => {
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
