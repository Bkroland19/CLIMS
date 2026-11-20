import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SampleDataNotice } from './SampleData';

describe('SampleDataNotice', () => {
  it('is a note that is not announced on arrival and does not print', () => {
    render(<SampleDataNotice subject="The order figures" />);

    const notice = screen.getByRole('note');
    expect(notice).toHaveTextContent('The order figures on this page are illustrative.');
    expect(notice).toHaveAttribute('data-print-hide');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
