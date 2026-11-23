import { z } from 'zod';

import { ugandanMobile } from '@/lib/phone';
import { decimalNumber } from '@/lib/validation';

import type { Hotspot, HotspotSubmission } from './api';

export const DISPENSER_CONDITIONS = ['Good', 'Poor', 'Broken'] as const;

/** Required text; limits match the API's (`HotspotDetails` in `docs/api/openapi.json`). */
function required(message: string, limit: number) {
  return z.string().trim().min(1, message).max(limit, `Use at most ${limit} characters.`);
}

/** Optional text; blank becomes `null`. */
function optional(limit: number) {
  return z
    .string()
    .trim()
    .max(limit, `Use at most ${limit} characters.`)
    .transform((value) => value || null);
}

export const submissionSchema = z
  .object({
    name: required('Enter the hotspot name.', 100),
    type: required('Enter the type of place.', 100),
    region_id: z.string().min(1, 'Choose the region.'),
    district_id: z.string().min(1, 'Choose the district.'),
    subcounty_id: z.string().min(1, 'Choose the subcounty.'),
    village: optional(100),
    latitude: decimalNumber('the latitude', { min: -90, max: 90 }),
    longitude: decimalNumber('the longitude', { min: -180, max: 180 }),
    contact_person_name: required('Enter the name of the hotspot manager.', 100),
    // Sent as `+256XXXXXXXXX`; the API takes 9 to 15 digits with an optional leading +.
    contact_person_phone: ugandanMobile("the hotspot manager's phone number"),
    has_condom_dispenser: z.enum(['', 'yes', 'no']),
    dispenser_condition: z.string(),
    comment: optional(2000),
  })
  .superRefine((values, ctx) => {
    if (values.has_condom_dispenser === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['has_condom_dispenser'],
        message: 'Say whether there is a condom dispenser.',
      });
    }
    if (values.has_condom_dispenser === 'yes' && values.dispenser_condition === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['dispenser_condition'],
        message: 'Choose the dispenser condition.',
      });
    }
  })
  .transform((values): HotspotSubmission => ({
    ...values,
    has_condom_dispenser: values.has_condom_dispenser === 'yes',
    dispenser_condition: values.has_condom_dispenser === 'yes' ? values.dispenser_condition : null,
  }));

export type SubmissionFormInput = z.input<typeof submissionSchema>;

export const SUBMISSION_FIELDS = [
  'name',
  'type',
  'region_id',
  'district_id',
  'subcounty_id',
  'village',
  'latitude',
  'longitude',
  'contact_person_name',
  'contact_person_phone',
  'has_condom_dispenser',
  'dispenser_condition',
  'comment',
] as const satisfies readonly (keyof SubmissionFormInput)[];

export const EMPTY_SUBMISSION: SubmissionFormInput = {
  name: '',
  type: '',
  region_id: '',
  district_id: '',
  subcounty_id: '',
  village: '',
  latitude: '',
  longitude: '',
  contact_person_name: '',
  contact_person_phone: '',
  has_condom_dispenser: '',
  dispenser_condition: '',
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
