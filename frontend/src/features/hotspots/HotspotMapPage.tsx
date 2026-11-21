'use client';

import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { MapPinOff } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { FilterSelect } from '@/components/FilterSelect';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppConfig } from '@/config/ConfigProvider';
import { formatText } from '@/lib/format';

import { mappableHotspots, type MappableHotspot } from './api';
import { mapSummary } from './mapSummary';
import { hotspotLabel } from './hotspotForm';
import { useHotspots, useLocationDistricts } from './queries';

/** Roughly the centre of Uganda, at a zoom that shows the whole country. */
const DEFAULT_CENTER = { lat: 1.3733, lng: 32.2903 };
const DEFAULT_ZOOM = 7;
const MAP_CLASS = 'h-[min(650px,70vh)] w-full';

interface HotspotMapProps {
  apiKey: string;
  hotspots: readonly MappableHotspot[];
  focusDistrict: boolean;
}

function HotspotMap({ apiKey, hotspots, focusDistrict }: HotspotMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'clims-google-maps',
    googleMapsApiKey: apiKey,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = hotspots.find((hotspot) => hotspot.id === selectedId);

  if (loadError) {
    return <ErrorState title="Could not load the map" error={loadError} />;
  }
  if (!isLoaded) {
    return <Skeleton className={`${MAP_CLASS} rounded-none`} />;
  }

  return (
    <GoogleMap
      mapContainerClassName={MAP_CLASS}
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: true }}
      onLoad={(map) => {
        if (!focusDistrict || hotspots.length === 0) return;
        const bounds = new google.maps.LatLngBounds();
        for (const hotspot of hotspots) {
          bounds.extend({ lat: hotspot.latitude, lng: hotspot.longitude });
        }
        if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
          map.setCenter(bounds.getCenter());
          map.setZoom(13);
        } else {
          map.fitBounds(bounds, 48);
        }
      }}
      onClick={() => {
        setSelectedId(null);
      }}
    >
      {hotspots.map((hotspot) => (
        <MarkerF
          key={hotspot.id}
          position={{ lat: hotspot.latitude, lng: hotspot.longitude }}
          title={hotspotLabel(hotspot)}
          onClick={() => {
            setSelectedId(hotspot.id);
          }}
        />
      ))}
      {selected ? (
        <InfoWindowF
          position={{ lat: selected.latitude, lng: selected.longitude }}
          onCloseClick={() => {
            setSelectedId(null);
          }}
        >
          {/* The info window is Google's own white surface in both themes, so
              its text uses fixed dark colours rather than theme tokens. */}
          <div className="flex max-w-56 flex-col gap-1 text-sm text-neutral-900">
            <p className="font-semibold break-words">{hotspotLabel(selected)}</p>
            <p className="break-words text-neutral-600">
              {formatText(selected.contact_person_name)} ·{' '}
              {formatText(selected.contact_person_telephone)}
            </p>
            <div>
              <StatusBadge status={selected.status} />
            </div>
          </div>
        </InfoWindowF>
      ) : null}
    </GoogleMap>
  );
}

export default function HotspotMapPage({
  canSwitchDistrict = false,
}: {
  canSwitchDistrict?: boolean;
}) {
  const { googleMapsApiKey } = useAppConfig();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const districtId = canSwitchDistrict ? params.get('district_id') || null : null;
  const districts = useLocationDistricts(canSwitchDistrict);
  const hotspots = useHotspots(districtId);
  const options = (districts.data ?? []).map(({ id, name }) => ({ value: id, label: name }));
  if (districtId && !options.some(({ value }) => value === districtId)) {
    options.unshift({ value: districtId, label: 'Selected district' });
  }
  const onMap = hotspots.data ? mappableHotspots(hotspots.data) : [];

  return (
    <>
      {canSwitchDistrict && (
        <div className="mb-3">
          <FilterSelect
            label="District"
            value={districtId ?? 'all'}
            options={[{ value: 'all', label: 'All districts' }, ...options]}
            disabled={districts.isPending}
            onValueChange={(next) => {
              const query = new URLSearchParams(params.toString());
              if (next === 'all') query.delete('district_id');
              else query.set('district_id', next);
              router.push(query.size ? `${pathname}?${query}` : pathname);
            }}
          />
          {districts.isError && (
            <ErrorState
              title="Could not load the districts"
              error={districts.error}
              onRetry={() => void districts.refetch()}
              isRetrying={districts.isRefetching}
            />
          )}
        </div>
      )}
      <div className="bg-card rounded-card overflow-hidden border">
        {googleMapsApiKey === null ? (
          <EmptyState
            icon={MapPinOff}
            title="The map is not set up"
            description="No Google Maps key is configured for this deployment. Ask whoever deploys CLIMS to set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY."
          />
        ) : hotspots.isError && !hotspots.data ? (
          <ErrorState
            title="Could not load hotspots"
            error={hotspots.error}
            onRetry={() => void hotspots.refetch()}
            isRetrying={hotspots.isRefetching}
          />
        ) : hotspots.isPending ? (
          <Skeleton className={`${MAP_CLASS} rounded-none`} />
        ) : (
          <HotspotMap
            key={districtId ?? 'all'}
            apiKey={googleMapsApiKey}
            hotspots={onMap}
            focusDistrict={districtId !== null}
          />
        )}
      </div>

      {hotspots.data && googleMapsApiKey !== null ? (
        <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
          {mapSummary(onMap.length, hotspots.data.length)}
        </p>
      ) : null}
    </>
  );
}
