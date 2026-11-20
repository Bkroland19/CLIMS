'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, CircleCheck, Plus, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { RowActions, type RowAction } from '@/components/data-table/RowActions';
import { ExportButton } from '@/components/ExportButton';
import { FormDialog } from '@/components/form/FormDialog';
import { TextField } from '@/components/form/TextField';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api';

import type { Hotspot, HotspotEvent } from './api';
import { dispenserSummary, hotspotLabel } from './hotspotForm';
import { HotspotFormDialog } from './HotspotFormDialog';
import { useHotspotAction, useHotspotNotifications, useHotspots } from './queries';

/** `review` is the DCFP's verification queue; `submit` is a VHT's own submissions. */
type Workspace = 'review' | 'submit';

const UPDATE_TEXT: Record<string, string> = {
  submitted: 'was submitted for verification',
  verify: 'was verified',
  activate: 'was activated',
  reject: 'was rejected',
};

function RecentUpdates({ events, hotspots }: { events: HotspotEvent[]; hotspots: Hotspot[] }) {
  if (events.length === 0) return null;
  const names = new Map(hotspots.map((hotspot) => [hotspot.id, hotspotLabel(hotspot)]));
  return (
    <section aria-labelledby="hotspot-updates" className="bg-card rounded-xl border p-4">
      <h2 id="hotspot-updates" className="text-sm font-semibold">
        Recent updates
      </h2>
      <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-sm">
        {events.slice(0, 5).map((event) => (
          <li key={event.id}>
            <span className="text-foreground font-medium">
              {names.get(event.hot_spot_id) ?? 'A hotspot'}
            </span>{' '}
            {UPDATE_TEXT[event.action] ?? event.action}{' '}
            <time dateTime={event.created_at}>
              {new Date(event.created_at).toLocaleDateString('en-GB')}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}

const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Say why the hotspot is rejected.')
    .max(1000, 'Use at most 1000 characters.'),
});

function RejectDialog({ hotspot, onClose }: { hotspot: Hotspot; onClose: () => void }) {
  const action = useHotspotAction();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<z.input<typeof rejectSchema>, unknown, z.output<typeof rejectSchema>>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { reason: '' },
  });
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Reject ${hotspotLabel(hotspot)}?`}
      description="The VHT who submitted it is notified and sees your reason."
      submitLabel="Reject hotspot"
      pendingLabel="Rejecting…"
      isPending={action.isPending}
      isDirty={isDirty}
      error={action.error ? getErrorMessage(action.error) : null}
      onSubmit={handleSubmit(({ reason }) => {
        action.mutate({ id: hotspot.id, action: 'reject', reason }, { onSuccess: onClose });
      })}
    >
      <TextField
        label="Reason"
        required
        autoComplete="off"
        error={errors.reason?.message}
        {...register('reason')}
      />
    </FormDialog>
  );
}

export default function HotspotsPage({ workspace }: { workspace: Workspace }) {
  const hotspots = useHotspots();
  const notifications = useHotspotNotifications();
  const action = useHotspotAction();
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState<Hotspot | null>(null);

  const columns = useMemo<DataTableColumn<Hotspot>[]>(
    () => [
      { id: 'name', header: 'Hotspot', value: (hotspot) => hotspot.name },
      { id: 'type', header: 'Type', value: (hotspot) => hotspot.type },
      { id: 'village', header: 'Village', value: (hotspot) => hotspot.village },
      { id: 'contact', header: 'Contact person', value: (hotspot) => hotspot.contact_person_name },
      {
        id: 'phone',
        header: 'Contact phone',
        value: (hotspot) => hotspot.contact_person_telephone,
      },
      { id: 'dispenser', header: 'Dispenser', value: dispenserSummary },
      {
        id: 'status',
        header: 'Status',
        value: (hotspot) => hotspot.status,
        cell: (hotspot) => <StatusBadge status={hotspot.status} />,
      },
      { id: 'reason', header: 'Rejection reason', value: (hotspot) => hotspot.rejection_reason },
    ],
    [],
  );

  const reviewActions = (hotspot: Hotspot): RowAction[] => {
    const act = (name: 'verify' | 'activate') => () => {
      action.mutate({ id: hotspot.id, action: name });
    };
    const actions: RowAction[] = [];
    if (hotspot.status === 'submitted')
      actions.push({ label: 'Verify', icon: BadgeCheck, onSelect: act('verify') });
    if (hotspot.status === 'verified')
      actions.push({ label: 'Activate', icon: CircleCheck, onSelect: act('activate') });
    if (hotspot.status === 'submitted' || hotspot.status === 'verified') {
      actions.push({
        label: 'Reject',
        icon: XCircle,
        destructive: true,
        onSelect: () => {
          setRejecting(hotspot);
        },
      });
    }
    return actions;
  };

  const submitButton = (
    <Button
      onClick={() => {
        setSubmitting(true);
      }}
    >
      <Plus data-icon="inline-start" />
      Submit hotspot
    </Button>
  );
  const isReview = workspace === 'review';

  return (
    <>
      <PageHeader
        description={
          isReview
            ? 'Hotspots submitted by VHTs in your district. Verify the details, then activate the hotspot.'
            : 'Hotspots you identified, and where each one is in district verification.'
        }
        actions={
          <>
            <ExportButton name="Hotspots" columns={columns} rows={hotspots.data} />
            {isReview ? null : submitButton}
          </>
        }
      />

      <RecentUpdates events={notifications.data ?? []} hotspots={hotspots.data ?? []} />

      <DataTable
        label="Hotspots"
        columns={columns}
        rows={hotspots.data}
        getRowId={(hotspot) => hotspot.id}
        isLoading={hotspots.isPending}
        error={hotspots.error}
        onRetry={() => void hotspots.refetch()}
        isRetrying={hotspots.isRefetching}
        searchPlaceholder="Search hotspots…"
        emptyTitle={isReview ? 'No hotspots to review' : 'No hotspots yet'}
        emptyDescription={
          isReview
            ? 'Hotspots that VHTs submit in your district appear here.'
            : 'Submit a hotspot you identified so the district can activate it.'
        }
        emptyAction={isReview ? undefined : submitButton}
        rowActions={
          isReview
            ? (hotspot) => {
                const actions = reviewActions(hotspot);
                return actions.length ? (
                  <RowActions label={`Actions for ${hotspotLabel(hotspot)}`} actions={actions} />
                ) : null;
              }
            : undefined
        }
      />

      {submitting ? (
        <HotspotFormDialog
          onClose={() => {
            setSubmitting(false);
          }}
        />
      ) : null}
      {rejecting ? (
        <RejectDialog
          hotspot={rejecting}
          onClose={() => {
            setRejecting(null);
          }}
        />
      ) : null}
    </>
  );
}
