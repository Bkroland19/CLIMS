'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { DataTable, type DataTableColumn } from '@/components/data-table/DataTable';
import { formLevelError } from '@/components/form/serverErrors';
import { TextField } from '@/components/form/TextField';
import { SampleDataNotice } from '@/components/SampleData';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/format';

import type { Unit } from './api';
import { toNewUnitInput, UNIT_FIELDS, unitSchema, type UnitForm } from './catalogueForms';
import { useCreateUnit, useUnits } from './queries';

/** Units condoms are counted in. NOT YET IN THE GO API (mock data). */
export default function UnitsPage() {
  const units = useUnits();

  const columns = useMemo<DataTableColumn<Unit>[]>(
    () => [
      {
        id: 'name',
        header: 'Unit',
        value: (unit) => unit.name,
        cell: (unit) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{unit.name}</div>
            {unit.note ? (
              <div className="text-muted-foreground truncate text-xs">{unit.note}</div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'products',
        header: 'Used by',
        numeric: true,
        value: (unit) => unit.product_count,
        cell: (unit) =>
          `${formatNumber(unit.product_count)} product${unit.product_count === 1 ? '' : 's'}`,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The units of measure" />
      <NewUnitForm />
      <DataTable
        label="Units of measure"
        columns={columns}
        rows={units.data}
        getRowId={(unit) => unit.id}
        isLoading={units.isPending}
        error={units.error}
        onRetry={() => void units.refetch()}
        isRetrying={units.isRefetching}
        searchPlaceholder="Search units…"
        emptyTitle="No units yet"
        emptyDescription="Add the first unit above. Every order and stock count uses pieces."
      />
    </div>
  );
}

function NewUnitForm() {
  const createUnit = useCreateUnit();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<UnitForm>({
    resolver: zodResolver(unitSchema),
    defaultValues: { name: '', note: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    createUnit.mutate(toNewUnitInput(values), {
      onSuccess: () => {
        reset();
      },
      onError: (error) => {
        setFormError(formLevelError(error, UNIT_FIELDS, setError));
      },
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a unit</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {formError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Could not add the unit</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <TextField
              label="Unit name"
              required
              autoComplete="off"
              placeholder="e.g. Dispenser pack"
              error={errors.name?.message}
              {...register('name')}
            />
            <TextField
              label="Note"
              autoComplete="off"
              placeholder="e.g. Refill for a hotspot dispenser"
              error={errors.note?.message}
              {...register('note')}
            />
            <Button type="submit" disabled={createUnit.isPending} className="sm:mt-6">
              {createUnit.isPending ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {createUnit.isPending ? 'Adding…' : 'Add unit'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
