import ReporterReportsPage from '@/features/reports/ReporterReportsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/reports');

export default function Page() {
  return <ReporterReportsPage workspace="dcfp" level="district" />;
}
