import RequestPage from '@/features/district/RequestPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock/[id]');

export default function Page() {
  return <RequestPage />;
}
