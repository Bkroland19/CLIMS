import HeldOrdersPage from '@/features/fulfilment/HeldOrdersPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/orders/held');

export default function Page() {
  return <HeldOrdersPage />;
}
