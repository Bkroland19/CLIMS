import DistrictRequestPage from '@/features/warehouse/DistrictRequestPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/requests/[id]');

export default function Page() {
  return <DistrictRequestPage />;
}
