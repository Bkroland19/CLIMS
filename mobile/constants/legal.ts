export const SUPPORT_EMAIL = "bkroland19@gmail.com";
export const TERMS_VERSION = "1.0";
export const TERMS_UPDATED = "14 November 2026";

export interface Faq {
	q: string;
	a: string;
}

/** Help & support FAQs. Keep answers in step with how the app actually behaves. */
export const FAQS: Faq[] = [
	{
		q: "I can't sign in. What should I do?",
		a: "Check that your username and password are typed correctly (passwords are case-sensitive; use the eye icon to see what you typed). Make sure you have an internet connection. If it still fails, contact your district focal person or support to confirm your account is active.",
	},
	{
		q: "How do I record a delivery of stock?",
		a: "Open the Stock tab and tap Add stock (or tap Add stock on the dashboard). Enter who delivered, choose the condom brand, enter the quantities and the delivery date, then tap Save stock.",
	},
	{
		q: "What is the difference between “Delivered” and “Already in stock”?",
		a: "“Delivered” is the number of pieces you received in this delivery. “Already in stock” is the number of pieces that were already at your hotspot when the delivery arrived. Stock on hand is the two added together.",
	},
	{
		q: "How do I tell the focal person I'm running out of stock?",
		a: "On the dashboard, tap Running low? Notify focal person and confirm. An alert is sent to your District focal person so a delivery can be arranged. Your account must be linked to a hotspot for this to work.",
	},
	{
		q: "How do I add a new hotspot?",
		a: "Open the Hotspots tab and tap Add hotspot. Fill in the details, then tap Use my current location while standing at the hotspot to pin it on the map (or enter the coordinates yourself). Tap Save hotspot when you're done.",
	},
	{
		q: "Why does the app ask for my location?",
		a: "Only to pin a hotspot's position when you add one. It is used once, when you tap to capture it. The app does not track your location in the background.",
	},
	{
		q: "The app says I'm offline.",
		a: "The app needs an internet connection to load and save information. Move to a place with better signal and pull down on the screen to refresh. Anything you were typing stays on the screen until you save it.",
	},
	{
		q: "I made a mistake in a delivery. Can I edit it?",
		a: "Deliveries can't be edited in the app yet. Contact support with the date, brand and the correct quantities, and they will help you correct it.",
	},
	{
		q: "How do I switch between light and dark mode?",
		a: "Go to Profile and open Appearance. Choose System (follows your phone), Light or Dark.",
	},
];

export interface TermsSection {
	title: string;
	body: string[];
}

export const TERMS: TermsSection[] = [
	{
		title: "1. About this app",
		body: [
			"The Last Mile Condom Distribution (LMD) app is provided by the Ministry of Health, Republic of Uganda. It helps authorised personnel record condom deliveries, monitor stock at distribution points (“hotspots”), and map those hotspots.",
		],
	},
	{
		title: "2. Accepting these terms",
		body: [
			"By signing in and using the app you agree to these Terms and Conditions. If you do not agree, please do not use the app and contact your supervisor.",
		],
	},
	{
		title: "3. Who may use the app",
		body: [
			"The app is for persons authorised by the Ministry of Health or a district health office. Your account is personal to you.",
			"Keep your username and password secret and do not share them. Tell your supervisor or support straight away if your details are lost or you think someone else has used your account.",
		],
	},
	{
		title: "4. Your responsibilities",
		body: [
			"Enter records that are true, accurate and made on time. Only record deliveries and hotspots that are real.",
			"Do not alter, delete or falsify records. Use the app only for your official duties under the condom distribution programme.",
		],
	},
	{
		title: "5. Information the app collects and why",
		body: [
			"Account information: your name, contact details and the hotspot you are assigned to.",
			"Delivery records: the date, condom brand, quantities, and the name and phone number of the person who delivered.",
			"Hotspot information: the hotspot's name, type, location (including coordinates), and the name and phone number of its contact person.",
			"Device location: only when you choose to capture a hotspot's position.",
			"This information is used to manage stock, plan supplies, monitor the reach of the programme and improve the service.",
		],
	},
	{
		title: "6. Privacy and confidentiality",
		body: [
			"Personal information is handled in line with the Data Protection and Privacy Act, 2019 and other applicable laws of Uganda.",
			"Information about hotspots, contact persons and distribution is sensitive. Use it only for your official work. Do not share, copy, photograph or disclose it to anyone who is not authorised to receive it.",
		],
	},
	{
		title: "7. Location",
		body: [
			"The app asks for your location only when you add a hotspot, and uses it once when you tap to capture it. The app does not track your location in the background. You can decline the permission and enter coordinates manually instead.",
		],
	},
	{
		title: "8. Acceptable use",
		body: [
			"You must not use the app for any unlawful purpose, try to access information beyond your role, interfere with or damage the service, introduce harmful software, or try to copy or reverse-engineer the app.",
		],
	},
	{
		title: "9. Availability and accuracy",
		body: [
			"The app needs an internet connection and may sometimes be unavailable, for example during maintenance or when the network is poor. The Ministry does not guarantee uninterrupted service.",
			"Stock figures reflect the records entered. Where it matters, check against the stock physically on hand.",
		],
	},
	{
		title: "10. Suspension of access",
		body: [
			"Access may be suspended or withdrawn if these terms are broken, if your account is misused, or when your role ends.",
		],
	},
	{
		title: "11. Changes to these terms",
		body: [
			"These terms may be updated from time to time. The version and date at the top of this page show when they were last changed. Continuing to use the app after a change means you accept the updated terms.",
		],
	},
	{
		title: "12. Governing law",
		body: ["These terms are governed by the laws of the Republic of Uganda."],
	},
	{
		title: "13. Questions",
		body: ["For questions about these terms, use Help & support in the app."],
	},
];
