import DistrictStorePage from '@/features/fulfilment/DistrictStorePage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock/store');

export default function Page() {
  return <DistrictStorePage />;
}
