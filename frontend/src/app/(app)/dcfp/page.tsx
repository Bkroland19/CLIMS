import DistrictDashboardPage from '@/features/district/DistrictDashboardPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp');

export default function Page() {
  return <DistrictDashboardPage />;
}
