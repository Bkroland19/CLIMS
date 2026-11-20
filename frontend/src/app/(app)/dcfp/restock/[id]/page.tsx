import WarehouseRequestPage from '@/features/fulfilment/WarehouseRequestPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock/[id]');

export default function Page() {
  return <WarehouseRequestPage />;
}
