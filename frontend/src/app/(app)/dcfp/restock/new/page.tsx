import NewWarehouseRequestPage from '@/features/fulfilment/NewWarehouseRequestPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock/new');

export default function Page() {
  return <NewWarehouseRequestPage />;
}
