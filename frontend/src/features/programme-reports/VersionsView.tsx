'use client';

import { ArrowLeft, Stamp } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { FormDialog } from '@/components/form/FormDialog';
import { PageActions } from '@/components/PageActions';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/features/auth/queries';
import { getErrorMessage } from '@/lib/api';
import { formatTimestamp } from '@/lib/format';

import type { ReportFilters, ReportKind, ReportTable, ReportVersion } from './api';
import {
  useApproveVersion,
  useCorrectVersion,
  useReportVersion,
  useReportVersions,
} from './queries';
import { DownloadButtons, ReportMeta, ReportTableView } from './ReportTableView';

const STATUS = {
  approved: { label: 'Approved', tone: 'positive' },
  superseded: { label: 'Superseded', tone: 'neutral' },
} as const;

/** A note or reason dialog: approving and correcting each ask for one line of text. */
function TextDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  required,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  required: boolean;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  error: string | null;
  onSubmit: (text: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [attempted, setAttempted] = useState(false);
  const missing = required && text.trim() === '';
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={submitLabel}
      pendingLabel={pendingLabel}
      isPending={isPending}
      isDirty={text !== ''}
      error={error}
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!missing) onSubmit(text.trim());
      }}
    >
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={id}>{label}</Label>
        <Textarea
          id={id}
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          aria-invalid={attempted && missing ? true : undefined}
          aria-describedby={attempted && missing ? `${id}-error` : undefined}
        />
        {attempted && missing ? (
          <p id={`${id}-error`} className="text-destructive text-sm">
            Give a reason for the correction.
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}

/** Saves the report as calculated now, with its filters, as an approved version (RF15). */
export function ApproveVersionButton({
  report,
  filters,
  table,
}: {
  report: ReportKind;
  filters: ReportFilters;
  table: ReportTable | undefined;
}) {
  const [open, setOpen] = useState(false);
  const approve = useApproveVersion();
  return (
    <>
      <Button
        disabled={!table}
        onClick={() => {
          setOpen(true);
        }}
      >
        <Stamp data-icon="inline-start" />
        Approve version
      </Button>
      {open ? (
        <TextDialog
          open
          onOpenChange={setOpen}
          title="Approve this report version"
          description={`Saves ${table?.title ?? 'the report'} for ${table?.period ?? 'this period'} exactly as calculated now. Later corrections become new versions; this one stays as approved.`}
          label="Note (optional)"
          required={false}
          submitLabel="Approve version"
          pendingLabel="Approving…"
          isPending={approve.isPending}
          error={approve.error ? getErrorMessage(approve.error) : null}
          onSubmit={(note) => {
            approve.mutate(
              { report, filters, note },
              {
                onSuccess: () => {
                  setOpen(false);
                },
              },
            );
          }}
        />
      ) : null}
    </>
  );
}

interface VersionsViewProps {
  selected: string | null;
  hrefFor: (id: string | null) => string;
}

/** Approved versions, newest first, and one version's saved figures. */
export function VersionsView({ selected, hrefFor }: VersionsViewProps) {
  return selected ? (
    <VersionDetail id={selected} hrefFor={hrefFor} />
  ) : (
    <VersionList hrefFor={hrefFor} />
  );
}

function VersionList({ hrefFor }: { hrefFor: VersionsViewProps['hrefFor'] }) {
  const versions = useReportVersions(null);
  const columns = useMemo<DataTableColumn<ReportVersion>[]>(
    () => [
      {
        id: 'title',
        header: 'Report',
        value: (version) => version.title,
        cell: (version) => (
          <Link
            href={hrefFor(version.id)}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {version.title}
          </Link>
        ),
      },
      { id: 'period', header: 'Period', value: (version) => version.period },
      { id: 'scope', header: 'Scope', value: (version) => version.scope },
      { id: 'approved_by', header: 'Approved by', value: (version) => version.approved_by },
      {
        id: 'created_at',
        header: 'Approved',
        value: (version) => version.created_at,
        cell: (version) => formatTimestamp(version.created_at),
      },
      {
        id: 'status',
        header: 'Status',
        value: (version) => STATUS[version.status].label,
        cell: (version) => (
          <StatusBadge status={STATUS[version.status].label} tone={STATUS[version.status].tone} />
        ),
      },
      {
        id: 'reason',
        header: 'Correction reason',
        value: (version) => version.correction_reason,
      },
    ],
    [hrefFor],
  );
  return (
    <DataTable
      label="Approved report versions"
      preferencesKey="report-versions"
      columns={columns}
      rows={versions.data}
      getRowId={(version) => version.id}
      isLoading={versions.isPending}
      error={versions.error}
      onRetry={() => void versions.refetch()}
      isRetrying={versions.isRefetching}
      searchPlaceholder="Search versions…"
      emptyTitle="No approved versions yet"
      emptyDescription="Approve a report from its tab to save its figures as they stand."
    />
  );
}

function VersionDetail({ id, hrefFor }: { id: string; hrefFor: VersionsViewProps['hrefFor'] }) {
  const can = useCan();
  const version = useReportVersion(id);
  const correct = useCorrectVersion();
  const [correcting, setCorrecting] = useState(false);
  const data = version.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href={hrefFor(null)}>
            <ArrowLeft data-icon="inline-start" />
            All versions
          </Link>
        </Button>
        <PageActions>
          <DownloadButtons
            table={data?.export}
            csvPath={`/reports/versions/${encodeURIComponent(id)}?format=csv`}
          />
          {can('reports:approve') && data?.status === 'approved' ? (
            <Button
              onClick={() => {
                setCorrecting(true);
              }}
            >
              Correct
            </Button>
          ) : null}
        </PageActions>
      </div>
      {data ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{data.title}</h2>
            <StatusBadge status={STATUS[data.status].label} tone={STATUS[data.status].tone} />
          </div>
          <ReportMeta table={data.export} />
          <p className="text-muted-foreground text-sm">
            Approved by {data.approved_by ?? 'an unnamed user'} on{' '}
            {formatTimestamp(data.created_at)}.{data.note ? ` Note: ${data.note}` : ''}
          </p>
          {data.supersedes_id ? (
            <p className="text-sm">
              Corrects{' '}
              <Link href={hrefFor(data.supersedes_id)} className="underline underline-offset-4">
                an earlier version
              </Link>
              : {data.correction_reason}
            </p>
          ) : null}
          {data.superseded_by_id ? (
            <p className="text-sm">
              Superseded by{' '}
              <Link href={hrefFor(data.superseded_by_id)} className="underline underline-offset-4">
                a correction
              </Link>
              . These figures are kept as they were approved.
            </p>
          ) : null}
        </div>
      ) : null}
      <ReportTableView
        table={data?.export}
        isLoading={version.isPending}
        error={version.error}
        onRetry={() => void version.refetch()}
        isRetrying={version.isRefetching}
      />
      {correcting ? (
        <TextDialog
          open
          onOpenChange={setCorrecting}
          title="Correct this version"
          description="Recalculates the report for the same filters and period from today's records, and saves it as a new version. This version is kept unchanged."
          label="Reason for the correction"
          required
          submitLabel="Save correction"
          pendingLabel="Saving…"
          isPending={correct.isPending}
          error={correct.error ? getErrorMessage(correct.error) : null}
          onSubmit={(reason) => {
            correct.mutate(
              { id, reason },
              {
                onSuccess: () => {
                  setCorrecting(false);
                },
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
