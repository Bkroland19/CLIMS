import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';

import { useFocusWhenLost } from './useFocusWhenLost';

/** A banner keyed on `status`, and a button that exists only while the status is "queued". */
function Record({ status }: { status: string | undefined }) {
  const bannerRef = useRef<HTMLDivElement>(null);
  useFocusWhenLost(bannerRef, status);
  return (
    <>
      <div ref={bannerRef} tabIndex={-1}>
        Status: {status ?? 'loading'}
      </div>
      {status === 'queued' ? <button type="button">Confirm</button> : null}
      <button type="button">Elsewhere</button>
    </>
  );
}

describe('useFocusWhenLost', () => {
  it('moves focus to the target when the key changes after focus was dropped', () => {
    const { rerender } = render(<Record status="queued" />);
    screen.getByRole('button', { name: 'Confirm' }).focus();

    rerender(<Record status="confirmed" />);

    expect(screen.getByText('Status: confirmed')).toHaveFocus();
  });

  it('leaves focus alone when it is still on an element', () => {
    const { rerender } = render(<Record status="queued" />);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();

    rerender(<Record status="confirmed" />);

    expect(elsewhere).toHaveFocus();
  });

  it('does not take focus on the first render or when the first value arrives', () => {
    const { rerender } = render(<Record status={undefined} />);
    expect(document.body).toHaveFocus();

    rerender(<Record status="queued" />);

    expect(document.body).toHaveFocus();
  });
});
