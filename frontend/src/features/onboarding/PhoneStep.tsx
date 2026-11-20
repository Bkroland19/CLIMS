'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import {
  formatUgandanMobile,
  parseUgandanMobile,
  ugandanMobile,
  UGANDAN_MOBILE_EXAMPLE,
} from '@/lib/phone';
import { SIGN_IN_PATH } from '@/navigation/paths';

import { FormProblem } from './FormProblem';
import { useSendCode } from './queries';
import type { StepProps } from './stepProps';

const phoneFormSchema = z.object({ phone: ugandanMobile('your phone number') });
type PhoneFormInput = z.input<typeof phoneFormSchema>;
type PhoneFormOutput = z.output<typeof phoneFormSchema>;
const FIELDS = ['phone'] as const;

/** Step 1: the phone number the invitation was sent to. Sends the SMS code. */
export function PhoneStep({ token, progress, onProgress, goTo }: StepProps) {
  const sendCode = useSendCode(token);
  const [problem, setProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<PhoneFormInput, unknown, PhoneFormOutput>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: progress ? formatUgandanMobile(progress.phone) : '' },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ phone }) => {
        setProblem(null);
        sendCode.mutate(
          { phone },
          {
            onSuccess: (sent) => {
              onProgress({
                invite: token,
                phone,
                code_sent_at: Date.now(),
                resend_after_seconds: sent.resend_after_seconds,
                activation_token: null,
                password_set: false,
              });
              goTo('code');
            },
            onError: (error) => {
              setProblem(formLevelError(error, FIELDS, setError));
            },
          },
        );
      })}
    >
      <FieldGroup>
        <FormProblem title="Could not send the code" message={problem} />
        <TextField
          label="Phone number"
          required
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          description={`The number the invitation was sent to, e.g. ${UGANDAN_MOBILE_EXAMPLE}.`}
          error={errors.phone?.message}
          {...register('phone', {
            // Shows the number the way it will be stored once it can be read.
            onBlur: (event: { target: { value: string } }) => {
              if (parseUgandanMobile(event.target.value)) {
                setValue('phone', formatUgandanMobile(event.target.value));
              }
            },
          })}
        />
        <Button type="submit" disabled={sendCode.isPending} className="w-full">
          {sendCode.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
          {sendCode.isPending ? 'Sending the code…' : 'Send me a code'}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          Already activated?{' '}
          <Link
            href={SIGN_IN_PATH}
            className="text-foreground font-medium underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
