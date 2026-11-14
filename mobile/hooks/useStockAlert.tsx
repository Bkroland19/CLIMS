import axios from "axios";
import { BASE_URL } from "@/constants/baseUrl";
import { useGlobalContext } from "@/context/auth/GlobalProvider";
import { useToast } from "@/components/ui";
import { useConfirm } from "@/hooks/useConfirm";
import { friendlyError } from "@/utils/errors";

/**
 * "Notify the district focal person that stock is running out": confirm dialog + request + toast.
 * Render `dialog` somewhere in the screen that uses it.
 */
export function useStockAlert() {
	const { user } = useGlobalContext();
	const toast = useToast();
	const { confirm, dialog } = useConfirm();

	const send = async () => {
		try {
			const res = await axios.post(`${BASE_URL}/sendstockoutNotification`, {
				user_id: user?.id,
				hotspot_id: user?.hotspot_id,
			});
			if (res.data.code === 200) {
				toast.success(res?.data.message || "The focal person has been notified.");
			}
		} catch (e) {
			toast.error(
				friendlyError(e, "Notification not sent. Make sure a hotspot is attached to your account, or contact the admin.")
			);
		}
	};

	const notify = async () => {
		const ok = await confirm({
			title: "Notify the focal person?",
			message: "They'll be told your hotspot is running out of stock so a delivery can be arranged.",
			confirmLabel: "Send alert",
			tone: "warning",
			icon: "notifications",
		});
		if (ok) send();
	};

	return { notify, dialog };
}
