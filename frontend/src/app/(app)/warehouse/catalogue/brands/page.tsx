import BrandsPage from '@/features/catalogue/BrandsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/catalogue/brands');

export default function Page() {
  return <BrandsPage />;
}
