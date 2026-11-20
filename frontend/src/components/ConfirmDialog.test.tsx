import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('keeps the action’s name while the request is in flight, without a stray status', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete hotspot?"
        description="It cannot be undone."
        confirmLabel="Delete hotspot"
        onConfirm={vi.fn()}
        isPending
      />,
    );

    // The spinner is decoration: it must not rename the button or announce "Loading".
    expect(screen.getByRole('button', { name: 'Delete hotspot' })).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces a failure inside the dialog', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete hotspot?"
        description="It cannot be undone."
        confirmLabel="Delete hotspot"
        onConfirm={vi.fn()}
        error={new ApiError({ kind: 'unknown', message: 'The hotspot has open orders.' })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('The hotspot has open orders.');
  });
});
