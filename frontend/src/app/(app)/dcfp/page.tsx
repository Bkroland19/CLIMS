import DcfpDashboardPage from '@/features/fulfilment/DcfpDashboardPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp');

export default function Page() {
  return <DcfpDashboardPage />;
}
