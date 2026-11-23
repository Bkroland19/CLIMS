import { useId } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PAGE_SIZES } from './useTablePreferences';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatNumber } from '@/lib/format';
import { pageLinks, type Page } from '@/lib/table/tableModel';

/** More rows the server holds than the table has loaded so far. */
export interface DataTableMore {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  /** What the rows are, plural and lower case, e.g. "movements". */
  noun: string;
}

interface TableFooterBarProps {
  label: string;
  page: Page<unknown>;
  onPage: (page: number) => void;
  more?: DataTableMore;
  pageSize: number;
  onPageSize: (size: number) => void;
}

/**
 * Under a table: which rows are showing, the page links and, when the server
 * holds more than was loaded, a button to fetch the next batch. The count
 * never pretends the loaded rows are all there are.
 */
export function TableFooterBar({
  label,
  page,
  onPage,
  more,
  pageSize,
  onPageSize,
}: TableFooterBarProps) {
  const sizeId = useId();
  const partial = more?.hasMore === true;
  return (
    <div
      data-print-hide
      className="flex flex-col gap-2 border-t px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-muted-foreground text-[0.8125rem] tabular-nums" aria-live="polite">
        {page.total > 0 ? (
          <>
            Showing {formatNumber(page.from)}–{formatNumber(page.to)} of{' '}
            {partial
              ? `the ${formatNumber(page.total)} ${more.noun} loaded so far`
              : formatNumber(page.total)}
          </>
        ) : (
          'No matching records'
        )}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={sizeId} className="text-muted-foreground text-xs">
            Rows per page
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onPageSize(Number(value));
            }}
          >
            <SelectTrigger id={sizeId} size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {page.pageCount > 1 ? (
          <nav aria-label={`${label} pages`} className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={page.page === 1}
              onClick={() => {
                onPage(page.page - 1);
              }}
            >
              Previous
            </Button>
            {pageLinks(page.page, page.pageCount).map((link, index) =>
              link === 'gap' ? (
                <span
                  key={`gap-${index}`}
                  className="text-muted-foreground px-1"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <Button
                  key={link}
                  variant={link === page.page ? 'default' : 'ghost'}
                  size="icon-sm"
                  className="tabular-nums"
                  aria-label={`Page ${link}`}
                  aria-current={link === page.page ? 'page' : undefined}
                  onClick={() => {
                    onPage(link);
                  }}
                >
                  {link}
                </Button>
              ),
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={page.page === page.pageCount}
              onClick={() => {
                onPage(page.page + 1);
              }}
            >
              Next
            </Button>
          </nav>
        ) : null}
        {partial ? (
          <Button variant="outline" size="sm" disabled={more.isLoading} onClick={more.onLoadMore}>
            {more.isLoading ? <Spinner data-icon="inline-start" aria-hidden="true" /> : null}
            {more.isLoading ? `Loading ${more.noun}…` : `Load more ${more.noun}`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
