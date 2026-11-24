import { describe, expect, it } from 'vitest';

import { groupPermissions, permissionLabel } from './access';

describe('permission wording on Roles & permissions', () => {
  it('describes the sync log permission in its own group', () => {
    expect(permissionLabel('sync_logs:read')).toBe(
      'View what field phones report about sending their saved actions',
    );
    expect(groupPermissions(['audit:read', 'sync_logs:read'])).toEqual([
      { label: 'Audit log', codes: ['audit:read'] },
      { label: 'Sync log', codes: ['sync_logs:read'] },
    ]);
  });

  it('shows the code itself for a permission the web app does not know yet', () => {
    expect(permissionLabel('stock:teleport')).toBe('stock:teleport');
  });
});
