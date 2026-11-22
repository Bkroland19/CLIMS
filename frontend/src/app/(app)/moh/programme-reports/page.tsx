import ProgrammeReportsPage from '@/features/programme-reports/ProgrammeReportsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/programme-reports');

export default function Page() {
  return <ProgrammeReportsPage workspace="moh" />;
}
