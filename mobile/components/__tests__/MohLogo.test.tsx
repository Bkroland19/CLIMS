import React from "react";
import renderer, { act } from "react-test-renderer";
import { AppThemeProvider } from "@/context/theme/ThemeProvider";
import MohLogo from "../MohLogo";

jest.mock("expo-secure-store", () => ({
	getItemAsync: jest.fn(() => Promise.resolve(null)),
	setItemAsync: jest.fn(() => Promise.resolve()),
}));

const textOf = (node: any): string =>
	!node ? "" : typeof node === "string" ? node : Array.isArray(node) ? node.map(textOf).join("") : textOf(node.children);

test("shows the ministry name and an accessible label", async () => {
	let tree!: renderer.ReactTestRenderer;
	await act(async () => {
		tree = renderer.create(
			<AppThemeProvider>
				<MohLogo />
			</AppThemeProvider>
		);
	});
	const out = textOf(tree.toJSON());
	expect(out).toContain("MINISTRY OF HEALTH");
	expect(out).toContain("REPUBLIC OF UGANDA");
	expect(tree.root.findAllByProps({ accessibilityLabel: "Ministry of Health, Republic of Uganda" }).length).toBeGreaterThan(0);
});
