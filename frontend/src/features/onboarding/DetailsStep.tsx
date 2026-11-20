'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { DetailList } from '@/components/DetailList';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';

import type { Invitation } from './api';
import { FormProblem } from './FormProblem';
import type { OnboardingProgress } from './progress';
import { useActivate } from './queries';
import type { StepProps } from './stepProps';

// Lengths follow the Go API's `users.AccountInput` (firstname/lastname max=20, email max=255).
const name = (noun: string) =>
  z.string().trim().min(1, `Enter your ${noun}.`).max(20, `Use at most 20 characters.`);

function detailsFormSchema(requiresNumberPlate: boolean) {
  return z.object({
    firstname: name('first name'),
    lastname: name('last name'),
    email: z
      .string()
      .trim()
      .min(1, 'Enter your email address.')
      .max(255)
      .pipe(z.email('Enter a valid email address.')),
    number_plate: requiresNumberPlate
      ? z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9 ]{5,10}$/, 'Enter the number plate, e.g. UFB 412K.')
      : z.string(),
    accepted_terms: z
      .boolean()
      .refine((value) => value, 'Tick the box to agree before you continue.'),
  });
}

type DetailsSchema = ReturnType<typeof detailsFormSchema>;
type DetailsFormInput = z.input<DetailsSchema>;
type DetailsFormOutput = z.output<DetailsSchema>;
const FIELDS = ['firstname', 'lastname', 'email', 'number_plate', 'accepted_terms'] as const;

type DetailsStepProps = Omit<StepProps, 'progress'> & {
  progress: OnboardingProgress;
  invitation: Invitation;
  /** Called once the account is active. */
  onActivated: () => void;
};

/** Step 4: the person's details, the access the invitation grants, and consent. */
export function DetailsStep({ token, progress, invitation, goTo, onActivated }: DetailsStepProps) {
  const activate = useActivate(token);
  const id = useId();
  const termsErrorId = `${id}-terms-error`;
  const [problem, setProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DetailsFormInput, unknown, DetailsFormOutput>({
    resolver: zodResolver(detailsFormSchema(invitation.requires_number_plate)),
    defaultValues: {
      firstname: invitation.firstname,
      lastname: invitation.lastname,
      email: invitation.email ?? '',
      number_plate: '',
      accepted_terms: false,
    },
  });

  const access = [
    { label: 'Roles', value: invitation.roles.join(', ') },
    { label: 'Working area', value: invitation.area },
    ...(invitation.hotspots.length > 0
      ? [{ label: 'Hotspots you cover', value: invitation.hotspots.join(', ') }]
      : []),
  ];

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => {
        setProblem(null);
        activate.mutate(
          {
            activation_token: progress.activation_token ?? '',
            firstname: values.firstname,
            lastname: values.lastname,
            email: values.email,
            number_plate: invitation.requires_number_plate ? values.number_plate : null,
            accepted_terms: true,
          },
          {
            onSuccess: onActivated,
            onError: (error) => {
              setProblem(formLevelError(error, FIELDS, setError));
            },
          },
        );
      })}
    >
      <FieldGroup>
        <FormProblem title="Could not activate your account" message={problem} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            required
            autoComplete="given-name"
            error={errors.firstname?.message}
            {...register('firstname')}
          />
          <TextField
            label="Last name"
            required
            autoComplete="family-name"
            error={errors.lastname?.message}
            {...register('lastname')}
          />
        </div>
        <TextField
          label="Email"
          required
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          description="You sign in to CLIMS with this address."
          error={errors.email?.message}
          {...register('email')}
        />
        {invitation.requires_number_plate ? (
          <TextField
            label="Motorbike number plate"
            required
            autoCapitalize="characters"
            spellCheck={false}
            description="For example UFB 412K."
            error={errors.number_plate?.message}
            {...register('number_plate')}
          />
        ) : null}

        <section aria-labelledby={`${id}-access`} className="bg-muted/50 rounded-lg border p-3">
          <h2 id={`${id}-access`} className="mb-2 text-sm font-medium">
            Your access
          </h2>
          <DetailList items={access} />
        </section>

        <Field data-invalid={errors.accepted_terms ? true : undefined}>
          <label htmlFor={`${id}-terms`} className="flex items-start gap-2 text-sm">
            <Checkbox
              id={`${id}-terms`}
              className="mt-0.5"
              aria-invalid={errors.accepted_terms ? true : undefined}
              aria-describedby={errors.accepted_terms ? termsErrorId : undefined}
              {...register('accepted_terms')}
            />
            <span>
              I agree to the CLIMS terms of use and to the Ministry of Health keeping a record of my
              actions in the system.
            </span>
          </label>
          <FieldError id={termsErrorId} errors={[errors.accepted_terms]} />
        </Field>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            onClick={() => {
              goTo('password');
            }}
          >
            Back
          </Button>
          <Button type="submit" disabled={activate.isPending} className="sm:flex-1">
            {activate.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {activate.isPending ? 'Activating…' : 'Activate account'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
