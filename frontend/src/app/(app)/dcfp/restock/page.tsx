import RequestsPage from '@/features/district/RequestsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock');

export default function Page() {
  return <RequestsPage />;
}
