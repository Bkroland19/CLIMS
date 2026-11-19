import { describe, expect, it } from 'vitest';

import { dispenserSummary, EMPTY_SUBMISSION, submissionSchema } from './hotspotForm';

const district = '7f2c3c5e-1d4b-4c1a-9a51-2a8f6f0b9e11';
const minimal = { ...EMPTY_SUBMISSION, name: ' Lake view bar ', district_id: district };

function issues(input: typeof EMPTY_SUBMISSION) {
  const result = submissionSchema.safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('submissionSchema', () => {
  it('turns blanks into nulls and trims text', () => {
    expect(submissionSchema.parse(minimal)).toEqual({
      name: 'Lake view bar',
      district_id: district,
      type: null,
      village: null,
      contact_person_name: null,
      contact_person_telephone: null,
      has_condom_dispenser: null,
      dispenser_condition: null,
      latitude: null,
      longitude: null,
      comment: null,
    });
  });

  it('sends the dispenser answer and drops a condition without a dispenser', () => {
    const withDispenser = {
      ...minimal,
      has_condom_dispenser: 'yes',
      dispenser_condition: 'Good',
    } as const;
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
    [{ name: 'x'.repeat(41) }, 'name'],
    [{ district_id: '' }, 'district_id'],
    [{ village: 'x'.repeat(21) }, 'village'],
    [{ contact_person_telephone: 'call me' }, 'contact_person_telephone'],
    [{ has_condom_dispenser: 'yes' as const }, 'dispenser_condition'],
    [{ latitude: '0.31' }, 'longitude'],
    [{ latitude: '91', longitude: '32' }, 'latitude'],
    [{ latitude: 'north', longitude: '32' }, 'latitude'],
  ])('rejects %o on %s', (change, field) => {
    expect(issues({ ...minimal, ...change })).toHaveProperty(field);
  });

  it('accepts a coordinate pair', () => {
    expect(
      submissionSchema.parse({ ...minimal, latitude: '0.31', longitude: '32.63' }),
    ).toMatchObject({
      latitude: 0.31,
      longitude: 32.63,
    });
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
