import HotspotsPage from '@/features/hotspots/HotspotsPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/vht');

export default function Page() {
  return <HotspotsPage workspace="submit" />;
}
