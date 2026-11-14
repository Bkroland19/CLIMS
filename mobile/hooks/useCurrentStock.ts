import { useQuery } from "@tanstack/react-query";
import { getCurrentStock } from "@/app/api/requests";
import { useGlobalContext } from "@/context/auth/GlobalProvider";

/** Stock currently on hand at the rider's hotspot. Components share one cached request. */
export function useCurrentStock() {
	const { user } = useGlobalContext();
	const query = useQuery({
		queryKey: ["currentStock", user?.hotspot?.id],
		queryFn: () => getCurrentStock(user?.hotspot?.id),
	});

	const total = parseInt(query.data?.quantity_brought, 10) + parseInt(query.data?.stock_found, 10);
	const stock = isNaN(total) ? 0 : total;

	return {
		stock,
		isLoading: query.isLoading,
		outOfStock: query.isSuccess && stock === 0,
	};
}
