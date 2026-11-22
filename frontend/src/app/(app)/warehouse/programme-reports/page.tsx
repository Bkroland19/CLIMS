import ProgrammeReportsPage from '@/features/programme-reports/ProgrammeReportsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/programme-reports');

export default function Page() {
  return <ProgrammeReportsPage workspace="warehouse" />;
}
