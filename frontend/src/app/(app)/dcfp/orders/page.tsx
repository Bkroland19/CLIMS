import AlertQueuePage from '@/features/district/AlertQueuePage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/orders');

export default function Page() {
  return <AlertQueuePage />;
}
