import OrderQueuePage from '@/features/fulfilment/OrderQueuePage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/orders');

export default function Page() {
  return <OrderQueuePage />;
}
