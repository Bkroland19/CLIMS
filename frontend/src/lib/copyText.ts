import { toast } from 'sonner';

/**
 * Copies `text` and says so. `what` names it in the message, e.g. "order ID".
 * The clipboard is missing outside a secure context, so failure is expected.
 */
export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied the ${what}.`);
  } catch {
    toast.error(`Could not copy the ${what}. Select it and copy it instead.`);
  }
}
