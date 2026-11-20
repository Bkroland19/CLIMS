import OrderReviewPage from '@/features/fulfilment/OrderReviewPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/orders/[id]');

export default function Page() {
  return <OrderReviewPage />;
}
