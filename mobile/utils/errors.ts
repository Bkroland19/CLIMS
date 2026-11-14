/** Turn any thrown error (usually axios) into a message a rider can act on. */
export const friendlyError = (error: any, fallback = "Something went wrong. Please try again."): string => {
	if (error?.response?.data?.message && typeof error.response.data.message === "string") {
		return error.response.data.message;
	}
	if (error?.code === "ERR_NETWORK" || error?.message === "Network Error") {
		return "No internet connection. Check your signal and try again.";
	}
	if (error?.code === "ECONNABORTED") {
		return "The request took too long. Please try again.";
	}
	const status = error?.response?.status;
	if (status === 401 || status === 403) return "You don't have access to do that. Please sign in again.";
	if (status >= 500) return "The server had a problem. Please try again in a moment.";
	return fallback;
};

/** "Today", "Yesterday", or "12 Mar 2026". */
export const relativeDate = (input: string | Date): string => {
	const d = new Date(input);
	if (isNaN(d.getTime())) return "";
	const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const days = Math.round((start(new Date()) - start(d)) / 86400000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days > 1 && days < 7) return `${days} days ago`;
	return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
