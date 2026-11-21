import DcfpDashboardPage from '@/features/dcfp/DcfpDashboardPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp');

export default function Page() {
  return <DcfpDashboardPage />;
}
