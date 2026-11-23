import DispatchPage from '@/features/dcfp/DispatchPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/stockouts/dispatch');

export default function Page() {
  return <DispatchPage />;
}
