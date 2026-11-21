import BrandsPage from '@/features/catalogue/BrandsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/catalogue/brands');

export default function Page() {
  return <BrandsPage />;
}
