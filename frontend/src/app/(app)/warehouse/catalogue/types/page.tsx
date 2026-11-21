import TypesPage from '@/features/catalogue/TypesPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/catalogue/types');

export default function Page() {
  return <TypesPage />;
}
