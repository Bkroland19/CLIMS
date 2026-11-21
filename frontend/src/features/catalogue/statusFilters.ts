/** A tab over a catalogue list: what it is called and which records it keeps. */
export interface StatusFilter<Row> {
  value: string;
  label: string;
  keeps: (row: Row) => boolean;
}

/** All, active and inactive, the filters every catalogue list has. */
export function activeFilters<Row extends { active: boolean }>(): StatusFilter<Row>[] {
  return [
    { value: 'all', label: 'All', keeps: () => true },
    { value: 'active', label: 'Active', keeps: (row) => row.active },
    { value: 'inactive', label: 'Inactive', keeps: (row) => !row.active },
  ];
}

/** The filter named by `status` in the address, or All. */
export function filterFrom<Row>(
  filters: readonly StatusFilter<Row>[],
  param: string | null,
): StatusFilter<Row> {
  const all = filters[0];
  if (!all) throw new Error('A catalogue list needs at least the All filter');
  return filters.find((filter) => filter.value === param) ?? all;
}

/** The page's address with `status` set, leaving it out for All. */
export function statusHref(path: string, status: string): string {
  return status === 'all' ? path : `${path}?status=${encodeURIComponent(status)}`;
}
