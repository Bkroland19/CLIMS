'use client';

import { History } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { useCan } from '@/features/auth/queries';
import { accessTo } from '@/navigation/access';
import { useWebAccess } from '@/navigation/useAccess';

import {
  AUDIT_AREAS,
  AUDIT_OUTCOMES,
  NO_FILTERS,
  type AuditArea,
  type AuditFilters,
  type AuditOutcome,
  type AuditSubject,
} from './api';

export const AUDIT_PATH = '/moh/audit';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT = /^([a-z][a-z0-9_]*):(.+)$/;
/** A field phone's sync log entry ID, as the API accepts it. */
export const CLIENT_ENTRY = /^[A-Za-z0-9_-]{8,64}$/;

function isArea(value: string | null): value is AuditArea {
  return AUDIT_AREAS.some((area) => area === value);
}

function isOutcome(value: string | null): value is AuditOutcome {
  return AUDIT_OUTCOMES.some((outcome) => outcome === value);
}

function parseSubject(value: string | null): AuditSubject | null {
  const match = value === null ? null : SUBJECT.exec(value);
  return match?.[1] && match[2] ? { type: match[1], id: match[2] } : null;
}

const day = (value: string | null): string | null => (value && DAY.test(value) ? value : null);

/**
 * Reads the filters from the address:
 * `?area=&outcome=&from=YYYY-MM-DD&to=YYYY-MM-DD&actor=<user id>&subject=<type>:<id>&entry=<phone entry>`.
 * Anything malformed is left out.
 */
export function auditFiltersFrom(params: URLSearchParams): AuditFilters {
  const area = params.get('area');
  const outcome = params.get('outcome');
  const actor = params.get('actor');
  const entry = params.get('entry');
  return {
    area: isArea(area) ? area : null,
    outcome: isOutcome(outcome) ? outcome : null,
    from: day(params.get('from')),
    to: day(params.get('to')),
    actor: actor && UUID.test(actor) ? actor : null,
    subject: parseSubject(params.get('subject')),
    clientEntry: entry && CLIENT_ENTRY.test(entry) ? entry : null,
  };
}

/** The audit log address for a set of filters, leaving out the defaults. */
export function auditHref(filters: Partial<AuditFilters> = {}): string {
  const { area, outcome, from, to, actor, subject, clientEntry } = { ...NO_FILTERS, ...filters };
  const params = new URLSearchParams();
  if (area) params.set('area', area);
  if (outcome) params.set('outcome', outcome);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (actor) params.set('actor', actor);
  if (subject) params.set('subject', `${subject.type}:${subject.id}`);
  if (clientEntry) params.set('entry', clientEntry);
  const query = params.toString();
  return query ? `${AUDIT_PATH}?${query}` : AUDIT_PATH;
}

/**
 * A button to one record's audit history, shown only to people who may read the
 * log and open the MOH workspace it lives in.
 */
export function AuditHistoryLink({
  subject,
  label = 'History',
}: {
  subject: AuditSubject;
  label?: string;
}) {
  const can = useCan();
  const access = useWebAccess();
  if (!can('audit:read') || accessTo(access, 'moh') === null) return null;
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={auditHref({ subject })}>
        <History data-icon="inline-start" />
        {label}
      </Link>
    </Button>
  );
}
