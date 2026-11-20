import MohDashboardPage from '@/features/moh/MohDashboardPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh');

export default function Page() {
  return <MohDashboardPage />;
}
