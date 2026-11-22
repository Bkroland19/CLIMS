import UnitsPage from '@/features/catalogue/UnitsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/catalogue/units');

export default function Page() {
  return <UnitsPage />;
}
