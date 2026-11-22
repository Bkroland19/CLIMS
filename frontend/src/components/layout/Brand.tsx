import Image from 'next/image';

import mohSeal from '@/assets/moh-seal.png';
import { cn } from '@/lib/utils';

interface BrandProps {
  className?: string;
}

/** The Ministry of Health seal and the product name. */
export function Brand({ className }: BrandProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Image
        src={mohSeal}
        alt="Ministry of Health, Uganda"
        width={44}
        height={44}
        loading="eager"
        className="size-11 shrink-0"
      />
      <span translate="no" className="text-lg font-semibold whitespace-nowrap">
        CLIMS
      </span>
    </div>
  );
}
