/** What assistive technology reads as focus lands on a field. */
export interface FocusLanding {
  invalid: boolean;
  description: string;
}

/**
 * Records, each time `element` gains focus, whether it was marked invalid and
 * what described it at that moment. A form that moves focus before rendering
 * its errors passes a later `toHaveAccessibleDescription` check, but lands
 * here with no error.
 */
export function recordFocus(element: HTMLElement): FocusLanding[] {
  const landings: FocusLanding[] = [];
  element.addEventListener('focus', () => {
    const ids = element.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    landings.push({
      invalid: element.getAttribute('aria-invalid') === 'true',
      description: ids
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim(),
    });
  });
  return landings;
}
