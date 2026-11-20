import { useEffect, useRef, type RefObject } from 'react';

/** True when nothing has focus: the focused element was removed or never set. */
function focusIsLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

/**
 * Moves focus to `target` when `key` changes and focus has been lost.
 *
 * When a button removes itself (a record's action that changes its status, a
 * link to another page), the browser drops focus to the page body and a
 * keyboard or screen reader user starts again from the top. Give the element
 * that says what happened (the status banner, the page's main region)
 * `tabIndex={-1}` and pass it here with the value that changes. Focus that is
 * still on an element, e.g. a button that only changed its label, is left alone.
 * A first value arriving (`undefined` while loading, then the status) is not a
 * change: the page has only just loaded.
 *
 * ```tsx
 * const bannerRef = useRef<HTMLDivElement>(null);
 * useFocusWhenLost(bannerRef, order.status);
 * <Alert ref={bannerRef} tabIndex={-1} variant="success">…</Alert>
 * ```
 */
export function useFocusWhenLost(target: RefObject<HTMLElement | null>, key: unknown): void {
  const previous = useRef(key);
  useEffect(() => {
    const before = previous.current;
    if (Object.is(before, key)) return;
    previous.current = key;
    if (before !== undefined && focusIsLost()) target.current?.focus();
  }, [key, target]);
}
