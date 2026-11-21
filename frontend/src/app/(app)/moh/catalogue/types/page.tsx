import TypesPage from '@/features/catalogue/TypesPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/catalogue/types');

export default function Page() {
  return <TypesPage />;
}
