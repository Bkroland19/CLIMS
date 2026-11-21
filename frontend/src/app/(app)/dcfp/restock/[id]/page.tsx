import WarehouseOrderPage from '@/features/dcfp/WarehouseOrderPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock/[id]');

export default function Page() {
  return <WarehouseOrderPage />;
}
