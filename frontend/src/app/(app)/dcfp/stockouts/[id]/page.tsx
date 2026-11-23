import StockoutRequestPage from '@/features/dcfp/StockoutRequestPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/stockouts/[id]');

export default function Page() {
  return <StockoutRequestPage />;
}
