import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { Role } from './api';
import { roleLabel } from './access';
import { roleDotClass } from './insights';

/** A role's name with its colour dot. The name carries the meaning; the dot only helps scanning. */
export function RoleBadge({ role }: { role: Pick<Role, 'id' | 'name'> }) {
  return (
    <Badge variant="secondary" className="gap-1.5">
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', roleDotClass(role.name))}
      />
      {roleLabel(role)}
    </Badge>
  );
}
