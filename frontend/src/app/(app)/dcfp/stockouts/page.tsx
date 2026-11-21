import StockoutsPage from '@/features/dcfp/StockoutsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/stockouts');

export default function Page() {
  return <StockoutsPage />;
}
