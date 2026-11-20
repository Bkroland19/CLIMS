import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { copyText } from './copyText';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('copyText', () => {
  it('copies and says what it copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await copyText('ORD-0141', 'order ID');

    expect(writeText).toHaveBeenCalledWith('ORD-0141');
    expect(toast.success).toHaveBeenCalledWith('Copied the order ID.');
  });

  it('says so when there is no clipboard to copy to', async () => {
    vi.stubGlobal('navigator', {});

    await copyText('ORD-0141', 'order ID');

    expect(toast.error).toHaveBeenCalledWith(
      'Could not copy the order ID. Select it and copy it instead.',
    );
  });
});
