import DispatchOrderPage from '@/features/fulfilment/DispatchOrderPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/dispatch/[id]');

export default function Page() {
  return <DispatchOrderPage />;
}
