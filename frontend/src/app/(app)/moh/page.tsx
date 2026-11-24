import ProgrammeReportsPage from '@/features/programme-reports/ProgrammeReportsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh');

export default function Page() {
  return <ProgrammeReportsPage workspace="moh" />;
}
