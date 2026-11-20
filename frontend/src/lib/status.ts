export type StatusTone = 'positive' | 'info' | 'caution' | 'negative' | 'neutral';

/*
 * The status words the web workspaces use, with the tone the prototype gives
 * them. A word whose tone depends on what it describes is left out on purpose
 * ("Received" is neutral for a closed hotspot order but positive for a
 * warehouse request); the caller passes the tone for those.
 */
const POSITIVE = new Set([
  'active',
  'approved',
  'verified',
  'delivered',
  'completed',
  'confirmed',
  'created',
  'ok',
  'intact',
  'stock available',
  'can be fulfilled',
  'dispatchable',
  'above minimum',
  'ready to send',
  'sent to moh',
]);
const INFO = new Set([
  'new',
  'draft',
  'sent',
  'queued',
  'in queue',
  'under review',
  'with rider',
  'out for delivery',
  'in transit',
  'updated',
]);
const CAUTION = new Set([
  'pending',
  'submitted',
  'pending verification',
  'in progress',
  'processing',
  'on hold',
  'below minimum',
  'still short',
  'near expiry',
  'label differs',
  'not sent',
]);
const NEGATIVE = new Set([
  'suspended',
  'rejected',
  'declined',
  'cancelled',
  'blocked',
  'expired',
  'damaged',
  'stocked out',
  'errors to fix',
  'deleted',
]);

/**
 * The tone a status word is shown in. Unrecognised words are neutral, never
 * guessed at. "Inactive" is neutral too: switched off is not an error.
 */
export function statusTone(status: string | null | undefined): StatusTone {
  const key = status?.trim().toLowerCase() ?? '';
  if (POSITIVE.has(key)) return 'positive';
  if (INFO.has(key)) return 'info';
  if (CAUTION.has(key)) return 'caution';
  if (NEGATIVE.has(key)) return 'negative';
  return 'neutral';
}
