import HotspotPage from '@/features/hotspots/HotspotPage';
import { pageMetadata } from '@/navigation/pageMetadata';

export const metadata = pageMetadata('/dcfp/hotspots/[id]');

export default function Page() {
  return <HotspotPage />;
}
