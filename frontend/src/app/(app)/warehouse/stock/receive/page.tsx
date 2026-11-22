import ReceiveStockPage from '@/features/warehouse/ReceiveStockPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/stock/receive');

export default function Page() {
  return <ReceiveStockPage />;
}
