import { describe, expect, it } from 'vitest';

import { dispenserSummary, EMPTY_SUBMISSION, submissionSchema } from './hotspotForm';

const complete = {
  ...EMPTY_SUBMISSION,
  name: ' Lake view bar ',
  type: 'Bar',
  region_id: 'region-1',
  district_id: 'district-1',
  subcounty_id: 'subcounty-1',
  latitude: '0.31',
  longitude: '32.63',
  contact_person_name: 'Okello James',
  contact_person_phone: '0772 000 000',
  has_condom_dispenser: 'no' as const,
};

function issues(input: typeof EMPTY_SUBMISSION) {
  const result = submissionSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('submissionSchema', () => {
  it('sends what the API requires, trimmed, with optional blanks as null', () => {
    expect(submissionSchema.parse(complete)).toEqual({
      name: 'Lake view bar',
      type: 'Bar',
      region_id: 'region-1',
      district_id: 'district-1',
      subcounty_id: 'subcounty-1',
      village: null,
      latitude: 0.31,
      longitude: 32.63,
      contact_person_name: 'Okello James',
      contact_person_phone: '+256772000000',
      has_condom_dispenser: false,
      dispenser_condition: null,
      comment: null,
    });
  });

  it('sends the dispenser condition only when there is a dispenser', () => {
    const withDispenser = { ...complete, has_condom_dispenser: 'yes', dispenser_condition: 'Good' };
    expect(submissionSchema.parse(withDispenser)).toMatchObject({
      has_condom_dispenser: true,
      dispenser_condition: 'Good',
    });
    expect(submissionSchema.parse({ ...withDispenser, has_condom_dispenser: 'no' })).toMatchObject({
      has_condom_dispenser: false,
      dispenser_condition: null,
    });
  });

  it.each([
    [{ name: '' }, 'name'],
    [{ name: 'x'.repeat(101) }, 'name'],
    [{ type: '' }, 'type'],
    [{ region_id: '' }, 'region_id'],
    [{ district_id: '' }, 'district_id'],
    [{ subcounty_id: '' }, 'subcounty_id'],
    [{ village: 'x'.repeat(101) }, 'village'],
    [{ contact_person_name: '' }, 'contact_person_name'],
    [{ contact_person_phone: '' }, 'contact_person_phone'],
    [{ contact_person_phone: 'call me' }, 'contact_person_phone'],
    [{ contact_person_phone: '+254 712 345 678' }, 'contact_person_phone'],
    [{ has_condom_dispenser: '' as const }, 'has_condom_dispenser'],
    [{ has_condom_dispenser: 'yes' as const }, 'dispenser_condition'],
    [{ latitude: '' }, 'latitude'],
    [{ longitude: '' }, 'longitude'],
    [{ latitude: '91' }, 'latitude'],
    [{ longitude: 'east' }, 'longitude'],
    [{ comment: 'x'.repeat(2001) }, 'comment'],
  ])('rejects %o on %s', (change, field) => {
    expect(issues({ ...complete, ...change })).toHaveProperty(field);
  });
});

describe('dispenserSummary', () => {
  it('describes the dispenser answers', () => {
    expect(dispenserSummary({ has_condom_dispenser: null, dispenser_condition: null })).toBeNull();
    expect(dispenserSummary({ has_condom_dispenser: false, dispenser_condition: null })).toBe('No');
    expect(dispenserSummary({ has_condom_dispenser: true, dispenser_condition: 'Poor' })).toBe(
      'Yes, poor',
    );
  });
});
