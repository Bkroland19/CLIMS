import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Alert, AlertDescription, AlertTitle } from './alert';

describe('Alert', () => {
  it.each([
    ['default', 'alert'],
    ['destructive', 'alert'],
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'status'],
  ] as const)('announces the %s variant as role="%s"', (variant, role) => {
    render(
      <Alert variant={variant}>
        <AlertTitle>Title</AlertTitle>
        <AlertDescription>Body</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole(role)).toHaveTextContent('TitleBody');
  });

  it('lets the caller override the role', () => {
    render(
      <Alert variant="destructive" role="status">
        <AlertTitle>Picks must add up</AlertTitle>
      </Alert>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Picks must add up');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
