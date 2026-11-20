import StoresPage from '@/features/stores/StoresPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/stores');

export default function Page() {
  return <StoresPage />;
}
