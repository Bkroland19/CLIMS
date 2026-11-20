import AuditLogPage from '@/features/audit/AuditLogPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/audit');

export default function Page() {
  return <AuditLogPage />;
}
