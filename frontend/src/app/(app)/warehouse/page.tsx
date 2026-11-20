import WarehouseDashboardPage from '@/features/warehouse/WarehouseDashboardPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse');

export default function Page() {
  return <WarehouseDashboardPage />;
}
