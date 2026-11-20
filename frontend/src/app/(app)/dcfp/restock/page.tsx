import WarehouseRequestsPage from '@/features/fulfilment/WarehouseRequestsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock');

export default function Page() {
  return <WarehouseRequestsPage />;
}
