import MohReportsPage from '@/features/reports/MohReportsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/reports');

export default function Page() {
  return <MohReportsPage />;
}
