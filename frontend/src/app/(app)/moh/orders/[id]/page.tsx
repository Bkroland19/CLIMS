import MohOrderAuditPage from '@/features/moh/MohOrderAuditPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/orders/[id]');

export default function Page() {
  return <MohOrderAuditPage />;
}
