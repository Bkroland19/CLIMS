import ProductsPage from '@/features/catalogue/ProductsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/catalogue');

export default function Page() {
  return <ProductsPage />;
}
