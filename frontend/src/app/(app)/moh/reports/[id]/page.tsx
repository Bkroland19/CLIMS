import MohReportPage from '@/features/reports/MohReportPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/reports/[id]');

export default function Page() {
  return <MohReportPage />;
}
