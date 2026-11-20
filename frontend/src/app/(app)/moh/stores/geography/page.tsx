import GeographyPage from '@/features/stores/GeographyPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/stores/geography');

export default function Page() {
  return <GeographyPage />;
}
