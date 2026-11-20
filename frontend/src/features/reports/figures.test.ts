import { describe, expect, it } from 'vitest';

import type { FigureKey } from './api';
import { checkReport, draftFrom, expectedClosing, inputFrom, type ReportDraft } from './figures';
import { aReport } from '@/test/reportFixtures';

type Row = Partial<Record<FigureKey, string>>;

const blankRow = { opening: '', received: '', issued: '', losses: '', closing: '', expiring: '' };

function draft(male: Row, female: Row, extra: Partial<ReportDraft> = {}): ReportDraft {
  return {
    figures: { male: { ...blankRow, ...male }, female: { ...blankRow, ...female } },
    daysOut: '0',
    lossReason: '',
    comment: '',
    ...extra,
  };
}

const district = {
  level: 'district',
  period: '2026-10',
  prefilled: ['opening', 'received', 'issued'],
} as const;
const warehouse = {
  level: 'warehouse',
  period: '2026-10',
  prefilled: ['opening', 'issued'],
} as const;

const balanced = {
  opening: '8200',
  received: '6000',
  issued: '11600',
  losses: '0',
  closing: '2600',
};
const balancedFemale = {
  opening: '300',
  received: '200',
  issued: '360',
  losses: '0',
  closing: '140',
};

describe('expectedClosing', () => {
  it('adds received to the opening balance and takes away issued and losses', () => {
    expect(expectedClosing({ ...blankRow, ...balanced })).toBe(2600);
    expect(
      expectedClosing({
        ...blankRow,
        opening: '1,000',
        received: '500',
        issued: '200',
        losses: '50',
      }),
    ).toBe(1250);
  });

  it('is unknown while a figure is missing or not a whole number', () => {
    expect(expectedClosing({ ...blankRow, opening: '100', received: '0', issued: '' })).toBeNull();
    expect(
      expectedClosing({ ...blankRow, opening: '100', received: '1.5', issued: '0', losses: '0' }),
    ).toBeNull();
  });
});

describe('checkReport', () => {
  it('passes a district report whose stock balances for both products', () => {
    expect(checkReport(district, draft(balanced, balancedFemale))).toEqual([]);
  });

  it('flags a closing balance that does not add up, with the figure it should be', () => {
    const problems = checkReport(district, draft({ ...balanced, closing: '2500' }, balancedFemale));
    expect(problems).toEqual([
      expect.objectContaining({
        field: 'male.closing',
        check: 'balance',
        where: 'Male · Closing balance',
        message: expect.stringContaining('= 2,600') as unknown,
      }),
    ]);
  });

  it('flags issuing and losing more than was held against the losses when issued is prefilled', () => {
    const problems = checkReport(
      district,
      draft(balanced, { ...balancedFemale, losses: '200', closing: '0' }),
      // 300 + 200 held; 360 issued + 200 lost is 560.
    );
    expect(problems).toEqual([
      expect.objectContaining({ field: 'female.losses', check: 'balance' }),
      // Losses were recorded without saying why.
      expect.objectContaining({ field: 'loss_reason', check: 'required' }),
    ]);
  });

  it('asks for every figure the reporter enters, and only those', () => {
    const problems = checkReport(
      district,
      draft({ opening: '8200', received: '6000', issued: '11600' }, balancedFemale),
    );
    expect(problems.map((problem) => problem.field)).toEqual(['male.losses', 'male.closing']);
    expect(problems.every((problem) => problem.check === 'required')).toBe(true);
  });

  it('rejects negative and fractional figures and skips the balance until they are fixed', () => {
    const problems = checkReport(
      district,
      draft({ ...balanced, losses: '-5', closing: '2.5' }, balancedFemale),
    );
    expect(problems).toEqual([
      expect.objectContaining({ field: 'male.losses', check: 'whole' }),
      expect.objectContaining({ field: 'male.closing', check: 'whole' }),
    ]);
  });

  it('accepts thousands separators', () => {
    expect(checkReport(district, draft({ ...balanced, closing: '2,600' }, balancedFemale))).toEqual(
      [],
    );
  });

  it('keeps days out of stock within the month', () => {
    const problems = checkReport(district, draft(balanced, balancedFemale, { daysOut: '32' }));
    expect(problems).toEqual([
      expect.objectContaining({
        field: 'days_out_of_stock',
        check: 'range',
        message: 'October has 31 days. Enter 0–31.',
      }),
    ]);
    expect(
      checkReport(district, draft(balanced, balancedFemale, { daysOut: '' }))[0],
    ).toMatchObject({ field: 'days_out_of_stock', check: 'required' });
  });

  it('needs a reason once anything was lost, and is satisfied by one', () => {
    const lossy = draft({ ...balanced, losses: '100', closing: '2500' }, balancedFemale);
    expect(checkReport(district, lossy).map((problem) => problem.field)).toEqual(['loss_reason']);
    expect(checkReport(district, { ...lossy, lossReason: 'Damaged' })).toEqual([]);
  });

  it('checks a warehouse report: received is entered, and expiring stock is part of the closing balance', () => {
    const male = {
      opening: '560000',
      received: '',
      issued: '180000',
      losses: '0',
      closing: '380000',
      expiring: '400000',
    };
    const female = {
      opening: '14000',
      received: '0',
      issued: '4000',
      losses: '0',
      closing: '10000',
      expiring: '0',
    };
    const report = draft(male, female, { daysOut: '' });
    expect(checkReport(warehouse, report)).toEqual([
      expect.objectContaining({ field: 'male.received', check: 'required' }),
    ]);
    expect(
      checkReport(warehouse, draft({ ...male, received: '0' }, female, { daysOut: '' })),
    ).toEqual([expect.objectContaining({ field: 'male.expiring', check: 'range' })]);
  });
});

describe('draftFrom and inputFrom', () => {
  it('round-trips the saved figures, sending blanks as null', () => {
    const report = aReport();
    const input = inputFrom(draftFrom(report), 'district');
    expect(input.figures.male).toEqual(report.figures.male);
    expect(input.figures.female).toEqual(report.figures.female);
    expect(input.days_out_of_stock).toBeNull();
    expect(input.comment).toBeNull();
  });

  it('drops a loss reason when nothing was lost, and leaves days out of stock off a warehouse report', () => {
    const typed = draft(balanced, balancedFemale, { lossReason: 'Damaged', daysOut: '3' });
    expect(inputFrom(typed, 'district')).toMatchObject({
      loss_reason: null,
      days_out_of_stock: 3,
    });
    expect(inputFrom(typed, 'warehouse').days_out_of_stock).toBeNull();
  });
});
