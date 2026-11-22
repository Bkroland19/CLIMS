import DeliveriesPage from '@/features/district/DeliveriesPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/dispatch');

export default function Page() {
  return <DeliveriesPage />;
}
