'use client';

import { Circle, CircleCheck, CircleX } from 'lucide-react';
import type { ReactNode } from 'react';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { InlineMessage } from '@/components/InlineMessage';
import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { StepTracker, type Step } from '@/components/StepTracker';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { timelineEntries } from '@/features/fulfilment/activity';
import { PRODUCTS, type ProductKey } from '@/features/fulfilment/products';
import { formatNumber, formatText } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { CheckId, FigureKey, MonthlyReport } from './api';
import {
  CHECKS,
  expectedClosing,
  fieldId,
  REPORT_FORMS,
  type FigureRow,
  type ReportDraft,
  type ReportProblem,
} from './figures';
import { LEVEL_LABELS, mohStatus, periodLabel, reporterStatus } from './status';

/*
 * The pieces of a monthly report page, shared by the reporter's form and the
 * read-only copy the reporter and MOH see once it is sent.
 */

/** "Wakiso district store · Wakiso district · Sarah Namubiru". */
export function unitLine(report: MonthlyReport): string {
  return [
    report.unit.name,
    report.unit.district && report.level !== 'warehouse'
      ? `${report.unit.district} district`
      : null,
    report.reporter,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The report's title: "October 2026 · District stock report". */
export function reportTitle(report: Pick<MonthlyReport, 'period' | 'level'>): string {
  return `${periodLabel(report.period)} · ${REPORT_FORMS[report.level].name}`;
}

interface ReportHeaderProps {
  report: MonthlyReport;
  steps: readonly Step[];
  /** Whose view: the reporter sees "Sent to MOH", MOH sees "New" or "Reviewed". */
  viewer: 'reporter' | 'moh';
}

export function ReportHeader({ report, steps, viewer }: ReportHeaderProps) {
  const status = viewer === 'moh' ? mohStatus(report) : reporterStatus(report);
  return (
    <DetailHeader
      title={reportTitle(report)}
      status={<StatusBadge status={status.label} tone={status.tone} />}
      description={`${report.id} · ${unitLine(report)}`}
    >
      <StepTracker aria-label="Report progress" steps={steps} />
    </DetailHeader>
  );
}

/** "Opening balance, received and issued are already filled in from CLIMS records." */
export function prefilledLine(report: MonthlyReport): string {
  const labels = REPORT_FORMS[report.level].rows
    .filter((row) => report.prefilled.includes(row.key))
    .map((row) => row.label.toLowerCase());
  if (labels.length === 0) return 'Nothing is filled in from CLIMS records for this report.';
  const list =
    labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels.at(-1) ?? ''}` : labels[0];
  const sentence = `${list ?? ''} ${labels.length > 1 ? 'are' : 'is'} already filled in from CLIMS records.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

interface FiguresCardProps {
  report: MonthlyReport;
  /** What has been typed. Leave out for a read-only copy. */
  draft?: ReportDraft;
  /** Messages to show under fields, by field (`male.closing`). */
  problems?: ReadonlyMap<string, string>;
  disabled?: boolean;
  onChange?: (product: ProductKey, key: FigureKey, value: string) => void;
}

/** The stock movement table: one row per figure, one column per product. */
export function FiguresCard({ report, draft, problems, disabled, onChange }: FiguresCardProps) {
  const form = REPORT_FORMS[report.level];
  const columns: DataTableColumn<FigureRow>[] = [
    {
      id: 'item',
      header: 'Item',
      cell: (row) => {
        const prefilled = report.prefilled.includes(row.key);
        return (
          <div className="min-w-40 whitespace-normal">
            <div className="flex flex-wrap items-center gap-1.5 font-medium">
              {row.label}
              {prefilled ? (
                <Badge variant="secondary" className="text-[0.6875rem]">
                  CLIMS<span className="sr-only">: filled in from CLIMS records</span>
                </Badge>
              ) : null}
            </div>
            <div className="text-muted-foreground text-xs">{row.hint}</div>
          </div>
        );
      },
    },
    ...PRODUCTS.map((product): DataTableColumn<FigureRow> => ({
      id: product.key,
      header: `${product.short} · ${product.brand}`,
      numeric: true,
      cell: (row) => {
        const field = `${product.key}.${row.key}`;
        const editable = draft !== undefined && !report.prefilled.includes(row.key);
        if (!editable) {
          const shown = draft
            ? draft.figures[product.key][row.key]
            : report.figures[product.key][row.key];
          return <span className="font-medium tabular-nums">{formatNumber(shown)}</span>;
        }
        const id = fieldId(field);
        const message = problems?.get(field);
        const expected = row.key === 'closing' ? expectedClosing(draft.figures[product.key]) : null;
        const describedBy = [
          message ? `${id}-error` : null,
          !message && expected !== null ? `${id}-expected` : null,
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div className="ml-auto flex w-32 flex-col items-end">
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="off"
              value={draft.figures[product.key][row.key]}
              onChange={(event) => onChange?.(product.key, row.key, event.target.value)}
              aria-label={`${product.name}, ${row.label}`}
              aria-invalid={message ? true : undefined}
              aria-describedby={describedBy || undefined}
              disabled={disabled}
              className="h-8 text-right tabular-nums"
            />
            <InlineMessage id={`${id}-error`} className="text-left whitespace-normal">
              {message}
            </InlineMessage>
            {!message && expected !== null ? (
              <span id={`${id}-expected`} className="text-muted-foreground mt-1 text-xs">
                Expected {formatNumber(expected)}
              </span>
            ) : null}
          </div>
        );
      },
    })),
  ];

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Stock movement</CardTitle>
        <CardDescription>
          In pieces, for {periodLabel(report.period)}. Rows marked CLIMS come from records already
          in the system.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable
          variant="embedded"
          label="Stock movement"
          columns={columns}
          rows={form.rows}
          getRowId={(row) => row.key}
        />
      </CardContent>
    </Card>
  );
}

/** The answers after the stock table, read-only. Null when the report has none. */
export function OtherDetailsCard({ report }: { report: MonthlyReport }) {
  const form = REPORT_FORMS[report.level];
  const items = [
    ...(form.daysOut
      ? [{ label: form.daysOut.label, value: formatNumber(report.days_out_of_stock) }]
      : []),
    ...(report.loss_reason ? [{ label: 'Reason for losses', value: report.loss_reason }] : []),
    ...report.extras.map((extra) => ({ label: extra.label, value: formatText(extra.value) })),
  ];
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{form.otherTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailList variant="grid" items={items} />
      </CardContent>
    </Card>
  );
}

export function CommentCard({ comment }: { comment: string | null }) {
  const text = comment?.trim();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comment for MOH</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn('text-sm whitespace-pre-wrap', !text && 'text-muted-foreground')}>
          {text || 'No comment.'}
        </p>
      </CardContent>
    </Card>
  );
}

export function HistoryCard({ report }: { report: MonthlyReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>Entry, validation and sending, oldest first</CardDescription>
      </CardHeader>
      <CardContent>
        {report.history.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing yet.</p>
        ) : (
          <ActivityTimeline entries={timelineEntries(report.history)} />
        )}
      </CardContent>
    </Card>
  );
}

type CheckState = 'pass' | 'fail' | 'pending';

/** Each check's result: pending until run, then pass or fail with how many problems it found. */
export function checkResults(
  problems: readonly Pick<ReportProblem, 'check'>[] | null,
): { id: CheckId; label: string; state: CheckState; count: number }[] {
  return CHECKS.map((check) => {
    const count = problems?.filter((problem) => problem.check === check.id).length ?? 0;
    return {
      ...check,
      count,
      state: problems === null ? 'pending' : count > 0 ? 'fail' : 'pass',
    };
  });
}

const CHECK_ICONS = {
  pass: { icon: CircleCheck, className: 'text-success', word: 'Passed' },
  fail: { icon: CircleX, className: 'text-destructive', word: 'Failed' },
  pending: { icon: Circle, className: 'text-muted-foreground', word: 'Not run yet' },
} as const;

interface ChecksCardProps {
  /** Null before the check has run. */
  problems: readonly Pick<ReportProblem, 'check'>[] | null;
  /** e.g. "Run 2 times". */
  description: string;
}

/** The four checks a report must pass, each with its result in words and an icon. */
export function ChecksCard({ problems, description }: ChecksCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation checks</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5 text-sm">
          {checkResults(problems).map((check) => {
            const look = CHECK_ICONS[check.state];
            const Icon = look.icon;
            return (
              <li key={check.id} data-state={check.state} className="flex items-start gap-2">
                <Icon
                  className={cn('mt-px size-4.5 shrink-0', look.className)}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1',
                    check.state === 'pending' && 'text-muted-foreground',
                  )}
                >
                  {check.label}
                  <span className="sr-only">: {look.word}</span>
                </span>
                {check.count > 0 ? (
                  <span className="text-destructive shrink-0 text-xs font-semibold">
                    {check.count} {check.count === 1 ? 'error' : 'errors'}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** A side card of facts with optional actions under them. */
export function FactsCard({
  title,
  items,
  children,
}: {
  title: string;
  items: readonly { label: string; value: ReactNode }[];
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DetailList items={items} />
        {children}
      </CardContent>
    </Card>
  );
}

/** "Hotspot", "District"…: the level a report comes from. */
export function levelLabel(report: Pick<MonthlyReport, 'level'>): string {
  return LEVEL_LABELS[report.level];
}
