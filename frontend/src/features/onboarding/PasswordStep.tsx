'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Circle } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { formLevelError } from '@/components/form/serverErrors';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

import { FormProblem } from './FormProblem';
import { PASSWORD_RULES, passwordFormSchema, type PasswordForm } from './passwordRules';
import type { OnboardingProgress } from './progress';
import { useSetPassword } from './queries';
import type { StepProps } from './stepProps';

const FIELDS = ['password', 'confirmation'] as const;

type PasswordStepProps = Omit<StepProps, 'progress'> & { progress: OnboardingProgress };

/** Step 3: the new account's password, with its rules checked as it is typed. */
export function PasswordStep({ token, progress, onProgress, goTo }: PasswordStepProps) {
  const save = useSetPassword(token);
  const id = useId();
  const rulesId = `${id}-rules`;
  const [isVisible, setIsVisible] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { password: '', confirmation: '' },
  });
  const [password, confirmation] = useWatch({ control, name: ['password', 'confirmation'] });
  const activationToken = progress.activation_token ?? '';

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => {
        setProblem(null);
        save.mutate(
          { activation_token: activationToken, password: values.password },
          {
            onSuccess: () => {
              onProgress({ ...progress, password_set: true });
              goTo('details');
            },
            onError: (error) => {
              setProblem(formLevelError(error, FIELDS, setError));
            },
          },
        );
      })}
    >
      <FieldGroup>
        <FormProblem title="Could not save the password" message={problem} />

        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
          <Input
            id={`${id}-password`}
            type={isVisible ? 'text' : 'password'}
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={[rulesId, errors.password ? `${id}-password-error` : null]
              .filter(Boolean)
              .join(' ')}
            {...register('password')}
          />
          <FieldError id={`${id}-password-error`} errors={[errors.password]} />
        </Field>

        <Field data-invalid={errors.confirmation ? true : undefined}>
          <FieldLabel htmlFor={`${id}-confirmation`}>Confirm password</FieldLabel>
          <Input
            id={`${id}-confirmation`}
            type={isVisible ? 'text' : 'password'}
            autoComplete="new-password"
            aria-invalid={errors.confirmation ? true : undefined}
            aria-describedby={errors.confirmation ? `${id}-confirmation-error` : undefined}
            {...register('confirmation')}
          />
          <FieldError id={`${id}-confirmation-error`} errors={[errors.confirmation]} />
        </Field>

        <label htmlFor={`${id}-show`} className="flex items-center gap-2 text-sm">
          <Checkbox
            id={`${id}-show`}
            checked={isVisible}
            onChange={(event) => {
              setIsVisible(event.target.checked);
            }}
          />
          Show passwords
        </label>

        <ul id={rulesId} aria-label="Password rules" className="flex flex-col gap-1.5 text-sm">
          {PASSWORD_RULES.map((rule) => {
            const isMet = rule.isMet(password, confirmation);
            const Icon = isMet ? Check : Circle;
            return (
              <li
                key={rule.id}
                data-met={isMet}
                className={cn(
                  'flex items-center gap-2',
                  isMet ? 'text-success' : 'text-muted-foreground',
                )}
              >
                <Icon aria-hidden="true" className={cn('size-4', !isMet && 'size-3.5')} />
                {/* The state in words, so it is not carried by the icon and colour alone. */}
                <span className="sr-only">{isMet ? 'Done:' : 'Not yet:'}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="sm:flex-1"
            onClick={() => {
              goTo('code');
            }}
          >
            Back
          </Button>
          <Button type="submit" disabled={save.isPending} className="sm:flex-1">
            {save.isPending ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {save.isPending ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
