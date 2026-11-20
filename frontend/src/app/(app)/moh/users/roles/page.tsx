import RolesPage from '@/features/users/RolesPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/moh/users/roles');

export default function Page() {
  return <RolesPage />;
}
