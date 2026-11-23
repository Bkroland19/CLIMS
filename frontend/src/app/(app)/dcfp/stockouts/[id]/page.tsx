import StockoutPage from '@/features/dcfp/StockoutPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/stockouts/[id]');

export default function Page() {
  return <StockoutPage />;
}
