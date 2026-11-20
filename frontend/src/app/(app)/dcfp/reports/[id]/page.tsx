import ReportPage from '@/features/reports/ReportPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/reports/[id]');

export default function Page() {
  return <ReportPage workspace="dcfp" />;
}
