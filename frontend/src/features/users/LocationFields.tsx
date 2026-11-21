import { Info } from 'lucide-react';
import { useId, useMemo } from 'react';
import {
  useController,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';

import { ComboboxField } from '@/components/form/ComboboxField';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { villageNames, type PlacedHotspot } from '@/features/geography/api';
import {
  useDistrictHotspots,
  useDistricts,
  useRegions,
  useSubcounties,
} from '@/features/geography/queries';
import { getErrorMessage, toApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';

import type { LocationField, LocationNeed, NewUserFormInput } from './userForm';

/** A lookup failure in words; a 403 means the viewer lacks the hotspot permission the lookups sit behind. */
function lookupError(error: unknown, what: string): string | undefined {
  if (!error) return undefined;
  if (toApiError(error).kind === 'forbidden') {
    return `Looking up ${what} needs the “Submit newly identified hotspots for activation” permission.`;
  }
  return `Could not load ${what}. ${getErrorMessage(error)}`;
}

/** Each level, and the levels below it that a new choice there clears. */
const BELOW: Record<LocationField, readonly LocationField[]> = {
  region_id: ['district_id', 'subcounty_id', 'village', 'hot_spot_id'],
  district_id: ['subcounty_id', 'village', 'hot_spot_id'],
  subcounty_id: ['village'],
  village: [],
  hot_spot_id: [],
};

/** Why a hotspot may not be in use yet; an active one needs no note. Rejected ones are not offered. */
const REVIEW_NOTES: Readonly<Record<string, string>> = {
  submitted: 'awaiting review',
  deactivated: 'deactivated',
};

/** A hotspot as a picker option: its name, then where it is and a note when it is not in use. */
function hotspotOption(hotspot: PlacedHotspot) {
  const where = [hotspot.village, hotspot.subcountyName].filter(Boolean).join(', ');
  const note = REVIEW_NOTES[hotspot.reviewStatus];
  return {
    value: hotspot.id,
    label: hotspot.name || 'Unnamed hotspot',
    hint: [where, note && capitalise(note)].filter(Boolean).join(' · ') || undefined,
  };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface LocationFieldsProps {
  need: LocationNeed;
  control: Control<NewUserFormInput>;
  register: UseFormRegister<NewUserFormInput>;
  setValue: UseFormSetValue<NewUserFormInput>;
  errors: FieldErrors<NewUserFormInput>;
}

/**
 * Where a new user works: region, then district, then either the hotspot they
 * run or the subcounty and village. Each list waits for the one above it and
 * is cleared when it changes.
 *
 * A hotspot manager finds their hotspot among the district's, by name or
 * village; it is saved with the account. Anyone else picks the subcounty and
 * types the village, with the names hotspots there use as suggestions,
 * because the API keeps no village list; that place is checked but not sent,
 * and the note says so.
 *
 * Shown for roles that work in one place (`locationNeedFor`).
 */
export function LocationFields({ need, control, register, setValue, errors }: LocationFieldsProps) {
  const villagesId = useId();
  // Controlled so the form can focus a list when it is the first field in error.
  const region = useController({ control, name: 'region_id' }).field;
  const district = useController({ control, name: 'district_id' }).field;
  const subcounty = useController({ control, name: 'subcounty_id' }).field;
  const hotSpot = useController({ control, name: 'hot_spot_id' }).field;
  const [regionId, districtId, subcountyId] = [region.value, district.value, subcounty.value];
  const regions = useRegions();
  const districts = useDistricts(regionId);
  const subcounties = useSubcounties(districtId);
  // The picker needs them at once; village suggestions only once a subcounty is chosen.
  const hotspots = useDistrictHotspots(
    need.pick === 'hotspot' || subcountyId !== '' ? districtId : '',
  );
  const isRequired = (field: LocationField) => need.required.includes(field);

  /** Sets one level and clears the ones under it, which no longer belong to it. */
  function choose(field: LocationField, value: string) {
    setValue(field, value, { shouldDirty: true, shouldValidate: Boolean(errors[field]) });
    for (const below of BELOW[field]) setValue(below, '', { shouldDirty: true });
  }

  const suggestions = useMemo(
    () =>
      villageNames((hotspots.data ?? []).filter((hotspot) => hotspot.subcountyId === subcountyId)),
    [hotspots.data, subcountyId],
  );
  const hotspotOptions = useMemo(
    () =>
      need.pick === 'hotspot'
        ? (hotspots.data ?? [])
            .filter((hotspot) => hotspot.reviewStatus !== 'rejected')
            .map(hotspotOption)
        : [],
    [hotspots.data, need.pick],
  );
  const noHotspots = districtId !== '' && hotspots.isSuccess && hotspotOptions.length === 0;

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4 sm:col-span-2">
      <legend className="px-1 text-sm font-medium">Where they work</legend>
      <p className="text-muted-foreground -mt-1 text-sm">{need.reason}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Region"
          required={isRequired('region_id')}
          value={regionId}
          onValueChange={(value) => {
            choose('region_id', value);
          }}
          onBlur={region.onBlur}
          triggerRef={region.ref}
          placeholder="Choose a region"
          options={(regions.data ?? []).map((place) => ({ value: place.id, label: place.name }))}
          isLoading={regions.isPending}
          loadError={lookupError(regions.error, 'regions')}
          error={errors.region_id?.message}
        />
        <SelectField
          label="District"
          required={isRequired('district_id')}
          value={districtId}
          onValueChange={(value) => {
            choose('district_id', value);
          }}
          onBlur={district.onBlur}
          triggerRef={district.ref}
          placeholder={regionId ? 'Choose a district' : 'Choose a region first'}
          options={(districts.data ?? []).map((place) => ({ value: place.id, label: place.name }))}
          isLoading={regionId !== '' && districts.isPending}
          loadError={lookupError(districts.error, 'districts')}
          disabled={!regionId}
          error={errors.district_id?.message}
        />
        {need.pick === 'hotspot' ? (
          <ComboboxField
            className="sm:col-span-2"
            label="Hotspot"
            required={isRequired('hot_spot_id')}
            value={hotSpot.value}
            onValueChange={(value) => {
              choose('hot_spot_id', value);
            }}
            onBlur={hotSpot.onBlur}
            triggerRef={hotSpot.ref}
            options={hotspotOptions}
            placeholder={
              !districtId
                ? 'Choose a district first'
                : noHotspots
                  ? 'No hotspots mapped in this district yet'
                  : 'Find their hotspot'
            }
            searchLabel="Search by name or village"
            noun="hotspots"
            isLoading={districtId !== '' && hotspots.isPending}
            loadError={lookupError(hotspots.error, 'hotspots')}
            disabled={!districtId || noHotspots}
            description={
              noHotspots
                ? 'A VHT maps a hotspot before it can have a manager.'
                : hotspotOptions.length > 0
                  ? `${formatNumber(hotspotOptions.length)} in this district.`
                  : undefined
            }
            error={errors.hot_spot_id?.message}
          />
        ) : (
          <>
            <SelectField
              label="Subcounty"
              required={isRequired('subcounty_id')}
              value={subcountyId}
              onValueChange={(value) => {
                choose('subcounty_id', value);
              }}
              onBlur={subcounty.onBlur}
              triggerRef={subcounty.ref}
              placeholder={districtId ? 'Choose a subcounty' : 'Choose a district first'}
              options={(subcounties.data ?? []).map((place) => ({
                value: place.id,
                label: place.name,
              }))}
              isLoading={districtId !== '' && subcounties.isPending}
              loadError={lookupError(subcounties.error, 'subcounties')}
              disabled={!districtId}
              error={errors.subcounty_id?.message}
            />
            <div className="flex flex-col">
              <TextField
                label="Village"
                required={isRequired('village')}
                autoComplete="off"
                list={villagesId}
                disabled={!subcountyId}
                placeholder={subcountyId ? 'Type or pick a village' : 'Choose a subcounty first'}
                description={
                  !subcountyId
                    ? undefined
                    : suggestions.length > 0
                      ? `${formatNumber(suggestions.length)} suggested from hotspots in this subcounty.`
                      : hotspots.isPending
                        ? 'Looking for villages hotspots already use…'
                        : 'No hotspot names a village here yet; type it.'
                }
                error={errors.village?.message}
                {...register('village')}
              />
              <datalist id={villagesId}>
                {suggestions.map((village) => (
                  <option key={village} value={village} />
                ))}
              </datalist>
            </div>
          </>
        )}
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {need.pick === 'hotspot'
          ? 'The hotspot is saved with the account. Region and district only narrow the list.'
          : 'Not saved with the account yet: the server does not store where a user works. It is checked here so the details are right when it does.'}
      </p>
    </fieldset>
  );
}
