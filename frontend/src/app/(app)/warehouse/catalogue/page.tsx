import ProductsPage from '@/features/catalogue/ProductsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/warehouse/catalogue');

export default function Page() {
  return <ProductsPage />;
}
