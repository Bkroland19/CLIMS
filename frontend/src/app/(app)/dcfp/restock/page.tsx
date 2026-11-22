import WarehouseOrdersPage from '@/features/dcfp/WarehouseOrdersPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock');

export default function Page() {
  return <WarehouseOrdersPage />;
}
