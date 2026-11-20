import MohOrdersPage from '@/features/moh/MohOrdersPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/orders');

export default function Page() {
  return <MohOrdersPage />;
}
