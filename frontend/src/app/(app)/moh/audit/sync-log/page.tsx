import SyncLogPage from '@/features/sync-log/SyncLogPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/audit/sync-log');

export default function Page() {
  return <SyncLogPage />;
}
