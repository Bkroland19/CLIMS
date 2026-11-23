import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { SelectField } from '@/components/form/SelectField';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { useDistricts, useRegions, useSubcounties } from '@/features/geography/queries';
import { getErrorMessage } from '@/lib/api';

import type { HotspotSubmission } from './api';
import {
  DISPENSER_CONDITIONS,
  EMPTY_SUBMISSION,
  SUBMISSION_FIELDS,
  submissionSchema,
  type SubmissionFormInput,
} from './hotspotForm';
import { useSubmitHotspot } from './queries';

const DISPENSER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const CONDITION_OPTIONS = DISPENSER_CONDITIONS.map((condition) => ({
  value: condition,
  label: condition,
}));

type PlaceField = 'region_id' | 'district_id' | 'subcounty_id';

/** Each place, and the places under it that a new choice clears. */
const BELOW: Record<PlaceField, readonly PlaceField[]> = {
  region_id: ['district_id', 'subcounty_id'],
  district_id: ['subcounty_id'],
  subcounty_id: [],
};

const PLACE_TEXT: Record<PlaceField, { label: string; placeholder: string }> = {
  region_id: { label: 'Region', placeholder: 'Choose the region…' },
  district_id: { label: 'District', placeholder: 'Choose the district…' },
  subcounty_id: { label: 'Subcounty', placeholder: 'Choose the subcounty…' },
};

interface PlacePickerProps {
  control: Control<SubmissionFormInput, unknown, HotspotSubmission>;
  name: PlaceField;
  places: { data?: readonly { id: string; name: string }[]; isPending: boolean; error: unknown };
  /** Why the list is not open yet, e.g. the place above it is not chosen; `null` when it is. */
  waitingFor: string | null;
  onChoose: (field: PlaceField, value: string) => void;
}

/** One level of the region, district and subcounty lists. */
function PlacePicker({ control, name, places, waitingFor, onChoose }: PlacePickerProps) {
  const { label, placeholder } = PLACE_TEXT[name];
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SelectField
          label={label}
          required
          value={field.value}
          onValueChange={(value) => {
            onChoose(name, value);
          }}
          onBlur={field.onBlur}
          triggerRef={field.ref}
          options={(places.data ?? []).map((place) => ({ value: place.id, label: place.name }))}
          placeholder={waitingFor ?? placeholder}
          disabled={waitingFor !== null}
          isLoading={waitingFor === null && places.isPending}
          loadError={places.error ? getErrorMessage(places.error) : undefined}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

interface HotspotFormDialogProps {
  onClose: () => void;
}

/** A VHT submits the details of a hotspot they identified. Mount it to open; `onClose` unmounts it. */
export function HotspotFormDialog({ onClose }: HotspotFormDialogProps) {
  const submitHotspot = useSubmitHotspot();
  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SubmissionFormInput, unknown, HotspotSubmission>({
    resolver: zodResolver(submissionSchema),
    defaultValues: EMPTY_SUBMISSION,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const hasDispenser = useWatch({ control, name: 'has_condom_dispenser' }) === 'yes';
  const [regionId, districtId] = useWatch({ control, name: ['region_id', 'district_id'] });
  const regions = useRegions();
  const districts = useDistricts(regionId);
  const subcounties = useSubcounties(districtId);

  /** Sets one place and clears the ones under it, which no longer belong to it. */
  function choose(field: PlaceField, value: string) {
    setValue(field, value, { shouldDirty: true, shouldValidate: Boolean(errors[field]) });
    for (const below of BELOW[field]) setValue(below, '', { shouldDirty: true });
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    submitHotspot.mutate(values, {
      onSuccess: onClose,
      onError: (error) => {
        setFormError(formLevelError(error, SUBMISSION_FIELDS, setError));
      },
    });
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Submit a hotspot"
      description="Send the details of a hotspot you identified. The district focal person reviews it and activates or rejects it."
      submitLabel="Submit hotspot"
      pendingLabel="Submitting…"
      isPending={submitHotspot.isPending}
      isDirty={isDirty}
      error={formError}
      onSubmit={onSubmit}
    >
      <TextField
        label="Hotspot name"
        required
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Type of place"
        required
        autoComplete="off"
        description="For example a bar, lodge or guest house."
        error={errors.type?.message}
        {...register('type')}
      />
      <PlacePicker
        control={control}
        name="region_id"
        places={regions}
        waitingFor={null}
        onChoose={choose}
      />
      <PlacePicker
        control={control}
        name="district_id"
        places={districts}
        waitingFor={regionId ? null : 'Choose the region first'}
        onChoose={choose}
      />
      <PlacePicker
        control={control}
        name="subcounty_id"
        places={subcounties}
        waitingFor={districtId ? null : 'Choose the district first'}
        onChoose={choose}
      />
      <TextField
        label="Village"
        autoComplete="off"
        error={errors.village?.message}
        {...register('village')}
      />
      <TextField
        label="Hotspot manager"
        required
        autoComplete="off"
        description="The person who runs the place, whom the district contacts."
        error={errors.contact_person_name?.message}
        {...register('contact_person_name')}
      />
      <TextField
        label="Manager's phone"
        required
        type="tel"
        autoComplete="off"
        error={errors.contact_person_phone?.message}
        {...register('contact_person_phone')}
      />
      <Controller
        control={control}
        name="has_condom_dispenser"
        render={({ field, fieldState }) => (
          <SelectField
            label="Condom dispenser on site"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={DISPENSER_OPTIONS}
            placeholder="Choose…"
            error={fieldState.error?.message}
          />
        )}
      />
      {hasDispenser ? (
        <Controller
          control={control}
          name="dispenser_condition"
          render={({ field, fieldState }) => (
            <SelectField
              label="Dispenser condition"
              required
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              triggerRef={field.ref}
              options={CONDITION_OPTIONS}
              placeholder="Choose the condition…"
              error={fieldState.error?.message}
            />
          )}
        />
      ) : null}
      <TextField
        label="Latitude"
        required
        inputMode="decimal"
        autoComplete="off"
        description="Decimal degrees, e.g. 0.3136. South is negative."
        error={errors.latitude?.message}
        {...register('latitude')}
      />
      <TextField
        label="Longitude"
        required
        inputMode="decimal"
        autoComplete="off"
        description="Decimal degrees, e.g. 32.5811."
        error={errors.longitude?.message}
        {...register('longitude')}
      />
      <TextField
        label="Comment"
        autoComplete="off"
        description="Anything the district focal person should know. It starts the hotspot's comment thread."
        error={errors.comment?.message}
        {...register('comment')}
      />
    </FormDialog>
  );
}
