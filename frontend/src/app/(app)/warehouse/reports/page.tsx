import WarehouseReportsPage from '@/features/reports/WarehouseReportsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/reports');

export default function Page() {
  return <WarehouseReportsPage />;
}
