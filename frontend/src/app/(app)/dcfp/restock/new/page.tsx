import NewWarehouseOrderPage from '@/features/dcfp/NewWarehouseOrderPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock/new');

export default function Page() {
  return <NewWarehouseOrderPage />;
}
