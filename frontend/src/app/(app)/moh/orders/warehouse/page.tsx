import MohRequestsPage from '@/features/moh/MohRequestsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/orders/warehouse');

export default function Page() {
  return <MohRequestsPage />;
}
