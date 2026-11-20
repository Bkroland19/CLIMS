import WarehouseStockPage from '@/features/warehouse/WarehouseStockPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/stock');

export default function Page() {
  return <WarehouseStockPage />;
}
