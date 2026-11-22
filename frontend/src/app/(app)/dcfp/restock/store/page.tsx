import StorePage from '@/features/district/StorePage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/restock/store');

export default function Page() {
  return <StorePage />;
}
