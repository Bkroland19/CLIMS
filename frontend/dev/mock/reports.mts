/**
 * Monthly stock reports for the mock API: each reporting unit's report per
 * month, MOH's view across units, and how many units have reported.
 *
 * None of these exist in the Go API yet. The paths and shapes here are the
 * contract the web client is written against (see `src/features/reports/api.ts`
 * and `design/IMPLEMENTATION_PLAN.md`, Phase 8). Replies use the Go API's
 * `{ success, data }` envelope and its `{ message, error }` failure body.
 *
 * The signed-in user is not known here, so the reporter's own list is chosen
 * by the query: `level=district` is Wakiso (the DCFP the fulfilment mock
 * plays), `level=warehouse&store=NMS|JMS` is that warehouse. The real API
 * works this out from the account.
 *
 * Rules the real API is expected to enforce, mirrored here: figures CLIMS
 * filled in cannot be changed, a report is only accepted when every product
 * balances (opening + received − issued − losses = closing), and a sent
 * report cannot be edited.
 */

import type { Reply } from './fulfilment.mts';

type Product = 'male' | 'female';
type Level = 'hotspot' | 'vht' | 'district' | 'warehouse';
type FigureKey = 'opening' | 'received' | 'issued' | 'losses' | 'closing' | 'expiring';
type Figures = Record<FigureKey, number | null>;
type Body = Record<string, unknown>;
type Check = 'required' | 'whole' | 'balance' | 'range';
type HistoryRole = 'hotspot_manager' | 'vht' | 'dcfp' | 'warehouse' | 'moh' | 'system';

interface HistoryEvent {
  id: string;
  at: string;
  actor: string;
  role: HistoryRole;
  role_label: string;
  text: string;
  reference: string | null;
}

interface Report {
  id: string;
  period: string;
  due_on: string;
  level: Level;
  unit: { id: string; name: string; district: string | null };
  reporter: string;
  status: 'draft' | 'errors' | 'submitted';
  figures: Record<Product, Figures>;
  prefilled: FigureKey[];
  days_out_of_stock: number | null;
  loss_reason: string | null;
  extras: { label: string; value: string }[];
  comment: string | null;
  errors: { field: string; check: Check; message: string }[];
  validation_runs: number;
  saved_at: string | null;
  submitted_at: string | null;
  receipt: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  history: HistoryEvent[];
}

interface State {
  reports: Report[];
  seq: { receipt: number; event: number };
}

const PRODUCTS: readonly Product[] = ['male', 'female'];
const FIGURE_KEYS: readonly FigureKey[] = [
  'opening',
  'received',
  'issued',
  'losses',
  'closing',
  'expiring',
];
const LEVELS: readonly Level[] = ['hotspot', 'vht', 'district', 'warehouse'];
const MOH_REVIEWER = 'Dr. Ruth Akello';
const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

/** Which rows CLIMS fills in from its own records, per level (as the prototype has it). */
const PREFILLED: Record<Level, FigureKey[]> = {
  hotspot: ['opening', 'received'],
  vht: ['opening', 'received'],
  district: ['opening', 'received', 'issued'],
  warehouse: ['opening', 'issued'],
};
const ASKS_DAYS_OUT: Record<Level, boolean> = {
  hotspot: true,
  vht: false,
  district: true,
  warehouse: false,
};
const ROLE: Record<Level, [HistoryRole, string]> = {
  hotspot: ['hotspot_manager', 'Hotspot manager'],
  vht: ['vht', 'VHT'],
  district: ['dcfp', 'DCFP'],
  warehouse: ['warehouse', 'Warehouse'],
};

/** National counts of units expected to report each month (sample figures from the prototype). */
const EXPECTED: Record<Level, number> = { hotspot: 412, vht: 1240, district: 146, warehouse: 2 };
/** Reports sent through other channels this month, on top of the ones held here. */
const SENT_ELSEWHERE: Record<Level, number> = {
  hotspot: 263,
  vht: 702,
  district: 97,
  warehouse: 0,
};
/** The share that reported in earlier months, percent. */
const EARLIER_RATE: Record<Level, number> = { hotspot: 78, vht: 66, district: 92, warehouse: 100 };

const ago = (minutes: number): string => new Date(Date.now() - minutes * MINUTE).toISOString();
const now = (): string => new Date().toISOString();

/** The reporting month `back` months before the one that has just closed: 0 is last month. */
function periodBack(back: number): string {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth() - 1 - back, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Reports are due on the 20th of the month after. */
function dueOn(period: string): string {
  const [year = 0, month = 1] = period.split('-').map(Number);
  const date = new Date(year, month, 20);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-20`;
}

function monthLabel(period: string): string {
  const [year = 0, month = 1] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

function daysIn(period: string): number {
  const [year = 0, month = 1] = period.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

/** Figures in row order; `null` is not entered yet. */
function fig(values: readonly (number | null)[]): Figures {
  const figures = {} as Figures;
  FIGURE_KEYS.forEach((key, index) => {
    figures[key] = values[index] ?? null;
  });
  return figures;
}

/** A balanced set: closing worked out from the rest. */
function bal(
  opening: number,
  received: number,
  issued: number,
  losses: number,
  expiring: number | null = null,
): Figures {
  return fig([opening, received, issued, losses, opening + received - issued - losses, expiring]);
}

interface Unit {
  level: Level;
  id: string;
  name: string;
  district: string | null;
  reporter: string;
}

const KASENYI: Unit = {
  level: 'hotspot',
  id: 'HS-0231',
  name: 'Kasenyi Landing Site',
  district: 'Wakiso',
  reporter: 'Grace Nakato',
};
const KATABI: Unit = {
  level: 'vht',
  id: 'VHT-0417',
  name: 'Katabi & Kajjansi VHT',
  district: 'Wakiso',
  reporter: 'Joseph Ssemwogerere',
};
const WAKISO: Unit = {
  level: 'district',
  id: 'WAKISO',
  name: 'Wakiso district store',
  district: 'Wakiso',
  reporter: 'Sarah Namubiru',
};
const NMS: Unit = {
  level: 'warehouse',
  id: 'NMS',
  name: 'National Medical Stores',
  district: null,
  reporter: 'Daniel Ochieng',
};
const JMS: Unit = {
  level: 'warehouse',
  id: 'JMS',
  name: 'Joint Medical Store',
  district: null,
  reporter: 'Paul Ssekandi',
};

interface Seed {
  status?: Report['status'];
  male: Figures;
  female: Figures;
  daysOut?: number | null;
  lossReason?: string | null;
  extras?: [string, string][];
  comment?: string | null;
  /** Minutes ago it was sent. */
  sentAgo?: number;
  savedAgo?: number;
  runs?: number;
  reviewed?: boolean;
  errors?: Report['errors'];
}

let state: State = { reports: [], seq: { receipt: 4800, event: 0 } };

function event(
  actor: string,
  role: HistoryRole,
  roleLabel: string,
  text: string,
  reference: string,
  at = now(),
): HistoryEvent {
  state.seq.event += 1;
  return { id: `RPE-${state.seq.event}`, at, actor, role, role_label: roleLabel, text, reference };
}

function makeReport(unit: Unit, period: string, seed: Seed): Report {
  const id = `RPT-${period.slice(2).replace('-', '')}-${unit.id.replace('-', '')}`;
  const status = seed.status ?? (seed.sentAgo === undefined ? 'draft' : 'submitted');
  const [role, roleLabel] = ROLE[unit.level];
  const sentAt = seed.sentAgo === undefined ? null : ago(seed.sentAgo);
  const savedAt = seed.savedAgo !== undefined ? ago(seed.savedAgo) : sentAt;
  const runs = seed.runs ?? (status === 'submitted' ? 1 : status === 'errors' ? 1 : 0);
  const report: Report = {
    id,
    period,
    due_on: dueOn(period),
    level: unit.level,
    unit: { id: unit.id, name: unit.name, district: unit.district },
    reporter: unit.reporter,
    status,
    figures: { male: seed.male, female: seed.female },
    prefilled: PREFILLED[unit.level],
    days_out_of_stock: ASKS_DAYS_OUT[unit.level] ? (seed.daysOut ?? null) : null,
    loss_reason: seed.lossReason ?? null,
    extras: (seed.extras ?? []).map(([label, value]) => ({ label, value })),
    comment: seed.comment ?? null,
    errors: seed.errors ?? [],
    validation_runs: runs,
    saved_at: savedAt,
    submitted_at: sentAt,
    receipt: null,
    reviewed_at: null,
    reviewed_by: null,
    history: [],
  };
  if (savedAt && status !== 'submitted') {
    report.history.push(
      event(
        unit.reporter,
        role,
        roleLabel,
        `Saved a draft of the ${monthLabel(period)} report`,
        id,
        savedAt,
      ),
    );
  }
  if (status === 'errors') {
    report.history.push(
      event(
        'CLIMS',
        'system',
        'System',
        `Validation found ${report.errors.length} error${report.errors.length === 1 ? '' : 's'} — returned to ${unit.reporter} to rectify`,
        id,
        savedAt ?? now(),
      ),
    );
  }
  if (sentAt) {
    state.seq.receipt += 1;
    report.receipt = `SRV-${period.slice(2).replace('-', '')}-${state.seq.receipt}`;
    report.history.push(
      event(
        unit.reporter,
        role,
        roleLabel,
        `Entered the ${monthLabel(period)} figures and submitted them for validation`,
        id,
        sentAt,
      ),
      event('CLIMS', 'system', 'System', 'Validation passed — no errors', id, sentAt),
      event(
        unit.reporter,
        role,
        roleLabel,
        `Sent the ${monthLabel(period)} report to MOH`,
        id,
        sentAt,
      ),
      event(
        'CLIMS',
        'system',
        'System',
        `Data sent to the MOH server — receipt ${report.receipt}`,
        id,
        sentAt,
      ),
    );
    if (seed.reviewed ?? true) {
      report.reviewed_at = sentAt;
      report.reviewed_by = MOH_REVIEWER;
      report.history.push(event(MOH_REVIEWER, 'moh', 'MOH', 'Reviewed the report', id, sentAt));
    }
  }
  return report;
}

function demoState(): State {
  state = { reports: [], seq: { receipt: 4800, event: 0 } };
  const current = periodBack(0);
  const previous = periodBack(1);
  const D = DAY_MINUTES;
  const hotspot = (dispenser: string): [string, string][] => [['Dispenser condition', dispenser]];
  const outreach = (visited: string, sessions: string, reached: string): [string, string][] => [
    ['Hotspots visited', visited],
    ['Outreach sessions held', sessions],
    ['People reached', reached],
  ];
  state.reports = [
    // The month that has just closed: the web reporters' drafts are waiting.
    makeReport(WAKISO, current, { male: fig([8200, 6000, 11600]), female: fig([300, 200, 360]) }),
    makeReport(NMS, current, {
      male: fig([560000, null, 180000]),
      female: fig([14000, null, 4000]),
    }),
    makeReport(JMS, current, { male: fig([210000, null, 62000]), female: fig([900, null, 500]) }),
    makeReport(KASENYI, current, {
      male: fig([120, 500, 560, 0, 80]),
      female: fig([6, 20, 30, 0, 0]),
      daysOut: 34,
      extras: hotspot('Working'),
      savedAgo: 900,
    }),
    makeReport(KATABI, current, {
      male: fig([200, 400]),
      female: fig([10, 30]),
      extras: outreach('', '', ''),
    }),
    makeReport(
      {
        level: 'hotspot',
        id: 'HS-0207',
        name: 'Kireka Truck Stop Lodge',
        district: 'Wakiso',
        reporter: 'Agnes Namata',
      },
      current,
      { male: fig([60, 0]), female: fig([4, 0]) },
    ),
    makeReport(
      {
        level: 'hotspot',
        id: 'HS-0198',
        name: 'Nansana Taxi Park',
        district: 'Wakiso',
        reporter: 'Ronald Kizza',
      },
      current,
      {
        male: bal(200, 600, 420, 0),
        female: bal(4, 40, 22, 0),
        daysOut: 0,
        extras: hotspot('Working'),
        sentAgo: 1500,
        reviewed: false,
      },
    ),
    makeReport(
      {
        level: 'hotspot',
        id: 'HS-0412',
        name: 'Busia Border Lodge',
        district: 'Busia',
        reporter: 'Florence Awori',
      },
      current,
      {
        male: bal(90, 400, 380, 10),
        female: bal(0, 20, 18, 0),
        daysOut: 2,
        lossReason: 'Damaged',
        extras: hotspot('Working'),
        sentAgo: 700,
        runs: 2,
        reviewed: false,
      },
    ),
    makeReport(
      {
        level: 'vht',
        id: 'VHT-1182',
        name: 'Namakwekwe parish VHT',
        district: 'Mbale',
        reporter: 'Simon Wanyama',
      },
      current,
      {
        male: bal(100, 300, 320, 0),
        female: bal(4, 20, 20, 0),
        extras: outreach('2', '8', '210'),
        sentAgo: 3000,
      },
    ),
    makeReport(
      {
        level: 'district',
        id: 'MUKONO',
        name: 'Mukono district store',
        district: 'Mukono',
        reporter: 'Harriet Achieng',
      },
      current,
      {
        male: bal(21000, 0, 15400, 200),
        female: bal(400, 0, 300, 0),
        daysOut: 0,
        lossReason: 'Expired',
        sentAgo: 2900,
        runs: 2,
      },
    ),
    makeReport(
      {
        level: 'district',
        id: 'GULU',
        name: 'Gulu district store',
        district: 'Gulu',
        reporter: 'Okot Denis',
      },
      current,
      {
        male: bal(6500, 8000, 9200, 0),
        female: bal(200, 0, 120, 0),
        daysOut: 0,
        comment:
          'A JMS consignment arrived on the 28th, after a week without male condoms in two sub-counties.',
        sentAgo: 4300,
        reviewed: false,
      },
    ),

    // The month before: everyone here sent theirs.
    makeReport(WAKISO, previous, {
      male: bal(14000, 0, 5800, 0),
      female: bal(520, 0, 220, 0),
      daysOut: 0,
      sentAgo: 39 * D + 120,
    }),
    makeReport(NMS, previous, {
      male: bal(640000, 100000, 180000, 0, 40000),
      female: bal(16000, 2000, 4000, 0, 1000),
      sentAgo: 41 * D + 200,
    }),
    makeReport(JMS, previous, {
      male: bal(260000, 0, 50000, 0, 0),
      female: bal(1200, 0, 300, 0, 0),
      sentAgo: 40 * D + 300,
    }),
    makeReport(KASENYI, previous, {
      male: bal(300, 600, 760, 20),
      female: bal(10, 40, 44, 0),
      daysOut: 3,
      lossReason: 'Damaged',
      extras: hotspot('Working'),
      sentAgo: 37 * D + 134,
      runs: 2,
    }),
    makeReport(KATABI, previous, {
      male: bal(150, 500, 450, 0),
      female: bal(6, 30, 26, 0),
      extras: outreach('3', '12', '340'),
      sentAgo: 35 * D + 60,
    }),
  ];
  return state;
}

function worstState(): State {
  demoState();
  const current = periodBack(0);
  state.reports.push(
    makeReport(
      {
        level: 'district',
        id: 'BUNDIBUGYO-NTOROKO',
        name: 'Bundibugyo–Ntoroko border post district store, Rwenzori sub-region',
        district: 'Bundibugyo',
        reporter: 'Wolfeschlegelsteinhausenbergerdorff-Nalubwama Kyomuhendo',
      },
      current,
      {
        status: 'errors',
        male: fig([9_999_999, 0, 1_234_567, 5, 9]),
        female: fig([0, 0, 0, null, null]),
        daysOut: 40,
        savedAgo: 60,
        errors: [
          {
            field: 'male.closing',
            check: 'balance',
            message: "Doesn't balance: opening + received − issued − losses = 8,765,427.",
          },
          { field: 'female.losses', check: 'required', message: 'Required. Enter 0 if none.' },
          {
            field: 'days_out_of_stock',
            check: 'range',
            message: 'That month does not have 40 days.',
          },
        ],
      },
    ),
  );
  return state;
}

function emptyState(): State {
  state = { reports: [], seq: { receipt: 4800, event: 0 } };
  return state;
}

const STATES = { demo: demoState, worst: worstState, empty: emptyState };

/** Seeds the report data for a dataset name. Unknown names fall back to the demo. */
export function seedReports(dataset: string): void {
  state = Object.hasOwn(STATES, dataset) ? STATES[dataset as keyof typeof STATES]() : demoState();
}

const ok = (data: unknown): Reply => ({ status: 200, body: { success: true, data } });
const fail = (status: number, message: string, errors?: Record<string, string>): Reply => ({
  status,
  body: { success: false, message, ...(errors ? { error: errors } : {}) },
});

function isRecord(value: unknown): value is Body {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A figure from the body: a whole number of pieces, null when blank, undefined when it is not one. */
function readFigure(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

/** Applies what the reporter sent, keeping the rows CLIMS filled in. Returns per-field format errors. */
function applyInput(report: Report, body: Body): Record<string, string> {
  const errors: Record<string, string> = {};
  const figures = isRecord(body.figures) ? body.figures : {};
  for (const product of PRODUCTS) {
    const sent = isRecord(figures[product]) ? figures[product] : {};
    for (const key of FIGURE_KEYS) {
      if (report.prefilled.includes(key)) continue;
      const value = readFigure(sent[key]);
      if (value === undefined)
        errors[`${product}.${key}`] = 'Enter a whole number of pieces, 0 or more.';
      else report.figures[product][key] = value;
    }
  }
  if (ASKS_DAYS_OUT[report.level]) {
    const days = readFigure(body.days_out_of_stock);
    if (days === undefined) errors.days_out_of_stock = 'Enter a whole number, 0 or more.';
    else report.days_out_of_stock = days;
  }
  report.loss_reason =
    typeof body.loss_reason === 'string' && body.loss_reason.trim()
      ? body.loss_reason.trim()
      : null;
  report.comment =
    typeof body.comment === 'string' && body.comment.trim() ? body.comment.trim() : null;
  return errors;
}

/** The server's own check, the same rules as the web client's. */
function validate(report: Report): { field: string; check: Check; message: string }[] {
  const problems: { field: string; check: Check; message: string }[] = [];
  const rows = FIGURE_KEYS.filter((key) => key !== 'expiring' || report.level === 'warehouse');
  for (const product of PRODUCTS) {
    const figures = report.figures[product];
    const missing = rows.filter((key) => figures[key] === null);
    for (const key of missing)
      problems.push({
        field: `${product}.${key}`,
        check: 'required',
        message: 'Required. Enter 0 if none.',
      });
    if (missing.length > 0) continue;
    const value = (key: FigureKey) => figures[key] ?? 0;
    const had = value('opening') + value('received');
    const out = value('issued') + value('losses');
    if (out > had) {
      problems.push({
        field: `${product}.losses`,
        check: 'balance',
        message: `Issued plus losses (${out}) is more than was held (${had}).`,
      });
    } else if (value('closing') !== had - out) {
      problems.push({
        field: `${product}.closing`,
        check: 'balance',
        message: `Doesn't balance: opening + received − issued − losses = ${had - out}.`,
      });
    }
    if (report.level === 'warehouse' && value('expiring') > value('closing')) {
      problems.push({
        field: `${product}.expiring`,
        check: 'range',
        message: "Can't be more than the closing balance.",
      });
    }
  }
  if (ASKS_DAYS_OUT[report.level]) {
    const days = report.days_out_of_stock;
    if (days === null)
      problems.push({
        field: 'days_out_of_stock',
        check: 'required',
        message: 'Required. Enter 0 if none.',
      });
    else if (days > daysIn(report.period))
      problems.push({
        field: 'days_out_of_stock',
        check: 'range',
        message: `Enter 0–${daysIn(report.period)}.`,
      });
  }
  const anyLoss = PRODUCTS.some((product) => (report.figures[product].losses ?? 0) > 0);
  if (anyLoss && !report.loss_reason)
    problems.push({
      field: 'loss_reason',
      check: 'required',
      message: 'Say why stock was lost or adjusted.',
    });
  return problems;
}

function save(report: Report, body: Body): Reply {
  if (report.status === 'submitted')
    return fail(409, 'This report has been sent and can no longer be changed.');
  const errors = applyInput(report, body);
  if (Object.keys(errors).length > 0)
    return fail(422, 'Some figures are not whole numbers.', errors);
  report.saved_at = now();
  const [role, roleLabel] = ROLE[report.level];
  report.history.push(
    event(
      report.reporter,
      role,
      roleLabel,
      `Saved a draft of the ${monthLabel(report.period)} report`,
      report.id,
    ),
  );
  return ok(report);
}

function submit(report: Report, body: Body): Reply {
  if (report.status === 'submitted') return fail(409, 'This report has already been sent.');
  const formatErrors = applyInput(report, body);
  const [role, roleLabel] = ROLE[report.level];
  report.saved_at = now();
  report.validation_runs += 1;
  report.history.push(
    event(
      report.reporter,
      role,
      roleLabel,
      report.validation_runs === 1
        ? `Entered the ${monthLabel(report.period)} figures and submitted them for validation`
        : 'Corrected the figures and resubmitted them for validation',
      report.id,
    ),
  );
  const problems =
    Object.keys(formatErrors).length > 0
      ? Object.entries(formatErrors).map(([field, message]) => ({
          field,
          check: 'whole' as const,
          message,
        }))
      : validate(report);
  if (problems.length > 0) {
    report.status = 'errors';
    report.errors = problems;
    report.history.push(
      event(
        'CLIMS',
        'system',
        'System',
        `Validation found ${problems.length} error${problems.length === 1 ? '' : 's'} — returned to ${report.reporter} to rectify`,
        report.id,
      ),
    );
    return fail(
      422,
      `The report did not pass validation: ${problems.length} error${problems.length === 1 ? '' : 's'} to fix.`,
      Object.fromEntries(problems.map((problem) => [problem.field, problem.message])),
    );
  }
  state.seq.receipt += 1;
  report.status = 'submitted';
  report.errors = [];
  report.submitted_at = now();
  report.receipt = `SRV-${report.period.slice(2).replace('-', '')}-${state.seq.receipt}`;
  report.history.push(
    event('CLIMS', 'system', 'System', 'Validation passed — no errors', report.id),
    event(
      report.reporter,
      role,
      roleLabel,
      `Sent the ${monthLabel(report.period)} report to MOH`,
      report.id,
    ),
    event(
      'CLIMS',
      'system',
      'System',
      `Data sent to the MOH server — receipt ${report.receipt}`,
      report.id,
    ),
  );
  return ok(report);
}

const newestFirst = (a: Report, b: Report) => b.period.localeCompare(a.period);

/** The months there are reports for, newest first. */
function periods(): { period: string; due_on: string }[] {
  const months = [...new Set(state.reports.map((report) => report.period))].sort().reverse();
  return months.map((period) => ({ period, due_on: dueOn(period) }));
}

function coverage(period: string): { level: Level; expected: number; submitted: number }[] {
  const isCurrent = period === periodBack(0);
  return LEVELS.map((level) => ({
    level,
    expected: EXPECTED[level],
    submitted: isCurrent
      ? SENT_ELSEWHERE[level] +
        state.reports.filter(
          (report) =>
            report.period === period && report.level === level && report.status === 'submitted',
        ).length
      : Math.round((EXPECTED[level] * EARLIER_RATE[level]) / 100),
  }));
}

/**
 * Answers a request for `/monthly-reports…`, or returns null when the path is
 * not one of these. `parts` is the path after `/api/v1`, split on `/`.
 */
export function handleReports(
  method: string,
  parts: readonly string[],
  body: Body,
  query: URLSearchParams,
): Reply | null {
  const [resource = '', id, action] = parts;
  if (resource !== 'monthly-reports') return null;

  if (!id) {
    if (method !== 'GET') return fail(405, 'Method not allowed');
    const period = query.get('period') ?? periodBack(0);
    return ok(state.reports.filter((report) => report.period === period));
  }
  if (id === 'own' && !action) {
    if (method !== 'GET') return fail(405, 'Method not allowed');
    const level = query.get('level');
    const unit =
      level === 'warehouse'
        ? query.get('store') === 'JMS'
          ? 'JMS'
          : 'NMS'
        : level === 'district'
          ? 'WAKISO'
          : null;
    if (!unit)
      return fail(422, 'Say which level: district or warehouse.', {
        level: 'Choose district or warehouse.',
      });
    return ok(state.reports.filter((report) => report.unit.id === unit).sort(newestFirst));
  }
  if (id === 'periods' && !action)
    return method === 'GET' ? ok(periods()) : fail(405, 'Method not allowed');
  if (id === 'coverage' && !action) {
    return method === 'GET'
      ? ok(coverage(query.get('period') ?? periodBack(0)))
      : fail(405, 'Method not allowed');
  }

  const report = state.reports.find((candidate) => candidate.id === id);
  if (!report) return fail(404, `Report ${id} was not found.`);
  if (!action) {
    if (method === 'GET') return ok(report);
    if (method === 'PUT') return save(report, body);
    return fail(405, 'Method not allowed');
  }
  if (method !== 'POST') return fail(405, 'Method not allowed');
  switch (action) {
    case 'submit':
      return submit(report, body);
    case 'review':
      if (report.status !== 'submitted') return fail(409, 'Only a sent report can be reviewed.');
      if (report.reviewed_at === null) {
        report.reviewed_at = now();
        report.reviewed_by = MOH_REVIEWER;
        report.history.push(event(MOH_REVIEWER, 'moh', 'MOH', 'Reviewed the report', report.id));
      }
      return ok(null);
    case 'remind':
      if (report.status === 'submitted') return fail(409, 'This report has already been sent.');
      report.history.push(
        event(
          MOH_REVIEWER,
          'moh',
          'MOH',
          `Reminded ${report.reporter} that the ${monthLabel(report.period)} report is due`,
          report.id,
        ),
      );
      return ok(null);
    default:
      return fail(404, 'Not found');
  }
}
