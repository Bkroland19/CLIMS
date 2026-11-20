import WarehouseReportPage from '@/features/reports/WarehouseReportPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/reports/[id]');

export default function Page() {
  return <WarehouseReportPage />;
}
