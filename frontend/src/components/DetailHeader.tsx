import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DetailHeaderProps extends Omit<ComponentProps<'section'>, 'title'> {
  /** The record's ID or name, shown as the section heading. */
  title: string;
  /** Usually a `StatusBadge`. */
  status?: ReactNode;
  /** One line of context, e.g. "Kawempe hotspot · Stockout · received Today, 09:12". */
  description?: ReactNode;
  /** Buttons for the record as a whole, e.g. "Print waybill". */
  actions?: ReactNode;
  /** Shown in a band under the heading, usually a `StepTracker`. */
  children?: ReactNode;
}

/**
 * The card at the top of a record's page: its ID, status, one line of context,
 * optional record-level actions, and an optional band for progress. The page
 * title stays in the heading band; this is an `h2`.
 *
 * ```tsx
 * <DetailHeader title="ORD-104" status={<StatusBadge status="Under review" />}
 *   description="Kawempe hotspot · received Today, 09:12">
 *   <StepTracker aria-label="Order progress" steps={steps} />
 * </DetailHeader>
 * ```
 */
export function DetailHeader({
  title,
  status,
  description,
  actions,
  children,
  className,
  ...props
}: DetailHeaderProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn('bg-card rounded-card overflow-hidden border', className)}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight break-all">
          {title}
        </h2>
        {status}
        {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
        {description ? (
          <p className="text-muted-foreground basis-full text-sm">{description}</p>
        ) : null}
      </div>
      {children ? <div className="bg-muted/40 border-t px-4 pt-2.5 pb-4">{children}</div> : null}
    </section>
  );
}
