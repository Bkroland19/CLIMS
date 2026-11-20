import DistrictRequestsPage from '@/features/warehouse/DistrictRequestsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/requests');

export default function Page() {
  return <DistrictRequestsPage />;
}
