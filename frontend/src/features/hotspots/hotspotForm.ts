import { z } from 'zod';

import { optionalUgandanMobile } from '@/lib/phone';
import { decimalNumber } from '@/lib/validation';

import type { Hotspot, HotspotSubmission } from './api';

export const DISPENSER_CONDITIONS = ['Good', 'Poor', 'Broken'] as const;

/** Optional text, blank becomes `null`; limits match the hotspot columns. */
function optional(limit: number) {
  return z
    .string()
    .trim()
    .max(limit, `Use at most ${limit} characters.`)
    .transform((value) => value || null);
}

/** An optional coordinate: blank is `null`, anything else must be a decimal in range. */
function optionalCoordinate(noun: string, range: { min: number; max: number }) {
  const coordinate = decimalNumber(noun, range);
  return z.string().transform((value, ctx) => {
    if (value.trim() === '') return null;
    const result = coordinate.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues)
      ctx.addIssue({ code: 'custom', message: issue.message });
    return z.NEVER;
  });
}

export const submissionSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the hotspot name.').max(40, 'Use at most 40 characters.'),
    district_id: z.string().min(1, 'Choose the district.'),
    type: optional(40),
    village: optional(20),
    contact_person_name: optional(40),
    // Sent as `+256XXXXXXXXX` (13 characters): the column holds at most 15.
    contact_person_telephone: optionalUgandanMobile().transform((value) => value || null),
    has_condom_dispenser: z.enum(['', 'yes', 'no']),
    dispenser_condition: z.string(),
    latitude: optionalCoordinate('a latitude', { min: -90, max: 90 }),
    longitude: optionalCoordinate('a longitude', { min: -180, max: 180 }),
    comment: optional(100),
  })
  .superRefine((values, ctx) => {
    if (values.has_condom_dispenser === 'yes' && values.dispenser_condition === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['dispenser_condition'],
        message: 'Choose the dispenser condition.',
      });
    }
    if ((values.latitude === null) !== (values.longitude === null)) {
      const missing = values.latitude === null ? 'latitude' : 'longitude';
      ctx.addIssue({
        code: 'custom',
        path: [missing],
        message: 'Enter both coordinates, or neither.',
      });
    }
  })
  .transform((values): HotspotSubmission => ({
    ...values,
    has_condom_dispenser:
      values.has_condom_dispenser === '' ? null : values.has_condom_dispenser === 'yes',
    dispenser_condition: values.has_condom_dispenser === 'yes' ? values.dispenser_condition : null,
  }));

export type SubmissionFormInput = z.input<typeof submissionSchema>;

export const SUBMISSION_FIELDS = [
  'name',
  'district_id',
  'type',
  'village',
  'contact_person_name',
  'contact_person_telephone',
  'has_condom_dispenser',
  'dispenser_condition',
  'latitude',
  'longitude',
  'comment',
] as const satisfies readonly (keyof SubmissionFormInput)[];

export const EMPTY_SUBMISSION: SubmissionFormInput = {
  name: '',
  district_id: '',
  type: '',
  village: '',
  contact_person_name: '',
  contact_person_telephone: '',
  has_condom_dispenser: '',
  dispenser_condition: '',
  latitude: '',
  longitude: '',
  comment: '',
};

export function hotspotLabel(hotspot: Pick<Hotspot, 'name'>): string {
  return hotspot.name ?? 'Unnamed hotspot';
}

/** "Yes, in good condition" style summary of the dispenser answers. */
export function dispenserSummary(
  hotspot: Pick<Hotspot, 'has_condom_dispenser' | 'dispenser_condition'>,
) {
  if (hotspot.has_condom_dispenser === null) return null;
  if (!hotspot.has_condom_dispenser) return 'No';
  return hotspot.dispenser_condition ? `Yes, ${hotspot.dispenser_condition.toLowerCase()}` : 'Yes';
}
