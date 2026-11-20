'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { SampleBadge } from '@/components/SampleData';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage } from '@/lib/api';
import { formatUgandanMobile } from '@/lib/phone';

import { MOCK_SMS_CODE } from './api';
import { FormProblem } from './FormProblem';
import { secondsUntilResend, type OnboardingProgress } from './progress';
import { useSendCode, useVerifyCode } from './queries';
import type { StepProps } from './stepProps';

const codeFormSchema = z.object({
  code: z
    .string()
    // People paste "482 913" from the SMS.
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS.')),
});
type CodeFormInput = z.input<typeof codeFormSchema>;
type CodeFormOutput = z.output<typeof codeFormSchema>;
const FIELDS = ['code'] as const;

type CodeStepProps = Omit<StepProps, 'progress'> & { progress: OnboardingProgress };

/** "0:45" */
function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Seconds until another code may be requested, counting down once a second. */
function useResendCountdown(progress: OnboardingProgress): number {
  const [now, setNow] = useState(() => Date.now());
  const remaining = secondsUntilResend(progress, now);

  useEffect(() => {
    if (remaining === 0) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [remaining]);

  return remaining;
}

/** Step 2: the 6-digit SMS code. Verifying it yields the activation token. */
export function CodeStep({ token, progress, onProgress, goTo }: CodeStepProps) {
  const verify = useVerifyCode(token);
  const resend = useSendCode(token);
  const remaining = useResendCountdown(progress);
  const [problem, setProblem] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<CodeFormInput, unknown, CodeFormOutput>({
    resolver: zodResolver(codeFormSchema),
    defaultValues: { code: '' },
  });
  const phone = formatUgandanMobile(progress.phone);

  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ code }) => {
        setProblem(null);
        verify.mutate(
          { phone: progress.phone, code },
          {
            onSuccess: (activationToken) => {
              onProgress({ ...progress, activation_token: activationToken, password_set: false });
              goTo('password');
            },
            onError: (error) => {
              setProblem(formLevelError(error, FIELDS, setError));
            },
          },
        );
      })}
    >
      <FieldGroup>
        <FormProblem title="Could not check the code" message={problem} />
        <TextField
          label="6-digit code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          error={errors.code?.message}
          {...register('code')}
        />
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <SampleBadge />
          <span>
            No SMS is sent yet. The development mock API accepts the code{' '}
            <strong className="text-foreground font-mono">{MOCK_SMS_CODE}</strong>.
          </span>
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            onClick={() => {
              goTo('phone');
            }}
          >
            Back
          </Button>
          <Button type="submit" disabled={verify.isPending} className="sm:flex-1">
            {verify.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {verify.isPending ? 'Checking…' : 'Verify'}
          </Button>
        </div>

        <div className="flex flex-col items-start gap-2 text-sm">
          {remaining > 0 ? (
            <p className="text-muted-foreground">
              Didn&apos;t get it? You can ask for a new code in {formatCountdown(remaining)}.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">Didn&apos;t get it?</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resend.isPending}
                onClick={() => {
                  setResendNotice(null);
                  resend.mutate(
                    { phone: progress.phone },
                    {
                      onSuccess: (sent) => {
                        onProgress({
                          ...progress,
                          code_sent_at: Date.now(),
                          resend_after_seconds: sent.resend_after_seconds,
                          activation_token: null,
                          password_set: false,
                        });
                        clearErrors('code');
                        setProblem(null);
                        setResendNotice(`We sent a new code to ${phone}.`);
                      },
                    },
                  );
                }}
              >
                {resend.isPending ? 'Sending…' : 'Send a new code'}
              </Button>
            </>
          )}
          {/* Always present, so assistive technology is listening before the notice arrives. */}
          <p role="status">{resendNotice}</p>
          {resend.isError ? (
            <p role="alert" className="text-destructive">
              Could not send a new code. {getErrorMessage(resend.error)}
            </p>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );
}
