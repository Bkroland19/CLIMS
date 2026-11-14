import { friendlyError, relativeDate } from "../errors";

describe("friendlyError", () => {
	test("prefers the server's message", () => {
		expect(friendlyError({ response: { data: { message: "Hotspot not found" } } })).toBe("Hotspot not found");
	});
	test("explains a network failure", () => {
		expect(friendlyError({ code: "ERR_NETWORK" })).toMatch(/internet connection/i);
		expect(friendlyError({ message: "Network Error" })).toMatch(/internet connection/i);
	});
	test("explains server errors and auth errors", () => {
		expect(friendlyError({ response: { status: 500 } })).toMatch(/server/i);
		expect(friendlyError({ response: { status: 401 } })).toMatch(/sign in again/i);
	});
	test("falls back to a generic message, never a raw error string", () => {
		expect(friendlyError(new Error("Request failed with status code 422"), "Custom fallback")).toBe("Custom fallback");
		expect(friendlyError(undefined)).toMatch(/something went wrong/i);
	});
});

describe("relativeDate", () => {
	const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
	test("today / yesterday / recent days", () => {
		expect(relativeDate(new Date())).toBe("Today");
		expect(relativeDate(daysAgo(1))).toBe("Yesterday");
		expect(relativeDate(daysAgo(3))).toBe("3 days ago");
	});
	test("older dates use a full date", () => {
		expect(relativeDate(new Date(2024, 0, 5))).toMatch(/5 Jan 2024/);
	});
	test("invalid input gives an empty string", () => {
		expect(relativeDate("not a date")).toBe("");
	});
});
