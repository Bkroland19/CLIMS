import DispatchPage from '@/features/fulfilment/DispatchPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/dispatch');

export default function Page() {
  return <DispatchPage />;
}
