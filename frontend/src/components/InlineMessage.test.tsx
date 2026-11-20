import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineMessage } from './InlineMessage';

describe('InlineMessage', () => {
  it('stays in the page as a polite live region while empty', () => {
    const { container, rerender } = render(<InlineMessage id="pieces-error">{null}</InlineMessage>);
    const region = container.querySelector('#pieces-error');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toBeEmptyDOMElement();

    // The message arrives in the same element, which is what gets it announced.
    rerender(<InlineMessage id="pieces-error">Enter a whole number</InlineMessage>);
    expect(container.querySelector('#pieces-error')).toBe(region);
    expect(region).toHaveTextContent('Enter a whole number');
  });

  it('describes the input that points at it', () => {
    render(
      <>
        <input aria-label="Pieces" aria-describedby="pieces-error" />
        <InlineMessage id="pieces-error">More than available</InlineMessage>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Pieces' })).toHaveAccessibleDescription(
      'More than available',
    );
  });

  it('marks its tone', () => {
    const { rerender } = render(<InlineMessage>Must be fixed</InlineMessage>);
    expect(screen.getByText('Must be fixed')).toHaveAttribute('data-tone', 'error');
    expect(screen.getByText('Must be fixed')).toHaveClass('text-destructive');

    rerender(<InlineMessage tone="warning">May stand</InlineMessage>);
    expect(screen.getByText('May stand')).toHaveAttribute('data-tone', 'warning');
    expect(screen.getByText('May stand')).toHaveClass('text-warning');
  });

  it('keeps layout classes passed in', () => {
    render(<InlineMessage className="whitespace-normal">Note</InlineMessage>);
    expect(screen.getByText('Note')).toHaveClass('whitespace-normal', 'text-xs');
  });
});
