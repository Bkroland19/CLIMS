import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { FormDialog } from '@/components/form/FormDialog';
import { SelectField } from '@/components/form/SelectField';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/lib/api';

import type { HotspotSubmission } from './api';
import {
  DISPENSER_CONDITIONS,
  EMPTY_SUBMISSION,
  SUBMISSION_FIELDS,
  submissionSchema,
  type SubmissionFormInput,
} from './hotspotForm';
import { useDistricts, useSubmitHotspot } from './queries';

const DISPENSER_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const CONDITION_OPTIONS = DISPENSER_CONDITIONS.map((condition) => ({
  value: condition,
  label: condition,
}));

interface HotspotFormDialogProps {
  onClose: () => void;
}

/** A VHT submits the details of a hotspot they identified. Mount it to open; `onClose` unmounts it. */
export function HotspotFormDialog({ onClose }: HotspotFormDialogProps) {
  const submitHotspot = useSubmitHotspot();
  const districts = useDistricts();
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<SubmissionFormInput, unknown, HotspotSubmission>({
    resolver: zodResolver(submissionSchema),
    defaultValues: EMPTY_SUBMISSION,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const hasDispenser = useWatch({ control, name: 'has_condom_dispenser' }) === 'yes';

  const districtOptions = useMemo(
    () => (districts.data ?? []).map((district) => ({ value: district.id, label: district.name })),
    [districts.data],
  );

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
      description="Send the details of a hotspot you identified. The district focal person verifies and activates it."
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
      <Controller
        control={control}
        name="district_id"
        render={({ field, fieldState }) => (
          <SelectField
            label="District"
            required
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            triggerRef={field.ref}
            options={districtOptions}
            placeholder="Choose the district…"
            isLoading={districts.isPending}
            loadError={districts.error ? getErrorMessage(districts.error) : undefined}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextField
        label="Type of place"
        autoComplete="off"
        description="For example a bar, lodge or guest house."
        error={errors.type?.message}
        {...register('type')}
      />
      <TextField
        label="Village"
        autoComplete="off"
        error={errors.village?.message}
        {...register('village')}
      />
      <TextField
        label="Contact person"
        autoComplete="off"
        error={errors.contact_person_name?.message}
        {...register('contact_person_name')}
      />
      <TextField
        label="Contact phone"
        type="tel"
        autoComplete="off"
        error={errors.contact_person_telephone?.message}
        {...register('contact_person_telephone')}
      />
      <Controller
        control={control}
        name="has_condom_dispenser"
        render={({ field, fieldState }) => (
          <SelectField
            label="Condom dispenser on site"
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
        inputMode="decimal"
        autoComplete="off"
        description="Decimal degrees, e.g. 0.3136. South is negative."
        error={errors.latitude?.message}
        {...register('latitude')}
      />
      <TextField
        label="Longitude"
        inputMode="decimal"
        autoComplete="off"
        description="Decimal degrees, e.g. 32.5811."
        error={errors.longitude?.message}
        {...register('longitude')}
      />
      <TextField
        label="Comment"
        autoComplete="off"
        error={errors.comment?.message}
        {...register('comment')}
      />
    </FormDialog>
  );
}
