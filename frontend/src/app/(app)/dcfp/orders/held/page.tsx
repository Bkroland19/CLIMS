import HeldAlertsPage from '@/features/district/HeldAlertsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/orders/held');

export default function Page() {
  return <HeldAlertsPage />;
}
