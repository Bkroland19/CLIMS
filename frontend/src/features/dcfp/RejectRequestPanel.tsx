'use client';

import { Check } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';

import { REJECTION_REASON_MAX, type StockoutReport } from './api';
import { useRejectStockout } from './queries';

/** Reasons a DCFP gives most often. Choosing one fills the box, where it can still be changed. */
const COMMON_REASONS = [
  'The district store has no stock to send right now.',
  'The hotspot was supplied recently and should still have stock.',
  'Stock comes with the next scheduled distribution.',
] as const;

interface Props {
  report: StockoutReport;
  onCancel: () => void;
}

/**
 * Rejecting a hotspot's request the district will not supply, before any stock has gone. It takes
 * the send form's place on the request page; the reason goes to the hotspot.
 */
export function RejectRequestPanel({ report, onCancel }: Props) {
  const reject = useRejectStockout(report.id);
  const reasonId = useId();
  // The panel replaces the button that opened it; carry focus to the reason it asks for.
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    reasonRef.current?.focus();
  }, []);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const hotspot = report.hot_spot.name;
  const error = reason.trim() === '' ? 'Say why the request is rejected.' : null;
  const serverError = reject.error ? getErrorMessage(reject.error) : null;

  function submit() {
    setTried(true);
    if (error) {
      reasonRef.current?.focus();
      return;
    }
    if (reject.isPending) return;
    reject.mutate(reason.trim());
  }

  return (
    <Card role="region" aria-labelledby={`${reasonId}-title`} className="min-w-0">
      <CardHeader>
        <CardTitle id={`${reasonId}-title`}>Reject this request</CardTitle>
        <CardDescription>
          Use this when the district cannot supply {hotspot}. The request closes and the hotspot is
          told why. If it reports again, a new request opens.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>Why can’t you supply it?</Label>
            <div role="group" aria-label="Common reasons" className="flex flex-wrap gap-1.5">
              {COMMON_REASONS.map((text) => {
                const chosen = reason.trim() === text;
                return (
                  <Button
                    key={text}
                    type="button"
                    variant="outline"
                    size="xs"
                    className="aria-pressed:border-foreground/40 aria-pressed:bg-secondary h-auto min-h-7 max-w-full py-1 text-left whitespace-normal"
                    aria-pressed={chosen}
                    disabled={reject.isPending}
                    onClick={() => {
                      setReason(text);
                      reasonRef.current?.focus();
                    }}
                  >
                    {chosen ? <Check aria-hidden="true" /> : null}
                    {text}
                  </Button>
                );
              })}
            </div>
            <Textarea
              id={reasonId}
              ref={reasonRef}
              name="reason"
              autoComplete="off"
              rows={3}
              maxLength={REJECTION_REASON_MAX}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              aria-required
              aria-invalid={tried && error ? true : undefined}
              aria-describedby={tried && error ? `${reasonId}-error` : `${reasonId}-hint`}
              placeholder="Choose a reason above, or write your own…"
              disabled={reject.isPending}
            />
            {tried && error ? (
              <FieldError id={`${reasonId}-error`}>{error}</FieldError>
            ) : (
              <p id={`${reasonId}-hint`} className="text-muted-foreground text-xs">
                Sent to the hotspot’s manager and to whoever reported it.
              </p>
            )}
          </div>

          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>The request was not rejected</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={reject.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="h-auto min-h-8 whitespace-normal"
              disabled={reject.isPending}
            >
              {reject.isPending ? 'Rejecting…' : `Reject and tell ${hotspot}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
