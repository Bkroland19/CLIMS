import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useApiQuery, useHttp } from '@/lib/api';

import {
  approveVersion,
  correctVersion,
  getReportTable,
  getSummary,
  getVersion,
  listVersions,
  type ReportFilters,
  type ReportKind,
  type SummaryKind,
} from './api';

const ROOT = 'programme-reports';
export const programmeReportKeys = {
  all: [ROOT] as const,
  table: (report: ReportKind, filters: ReportFilters) => [ROOT, 'table', report, filters] as const,
  summary: (report: ReportKind, filters: ReportFilters) =>
    [ROOT, 'summary', report, filters] as const,
  versions: (report: ReportKind | null) => [ROOT, 'versions', report] as const,
  version: (id: string) => [ROOT, 'version', id] as const,
};

export function useReportTable(report: ReportKind, filters: ReportFilters) {
  return useApiQuery(programmeReportKeys.table(report, filters), (http, signal) =>
    getReportTable(http, report, filters, signal),
  );
}

export function useReportSummary<Kind extends SummaryKind>(report: Kind, filters: ReportFilters) {
  return useApiQuery(programmeReportKeys.summary(report, filters), (http, signal) =>
    getSummary(http, report, filters, signal),
  );
}

export function useReportVersions(report: ReportKind | null) {
  return useApiQuery(programmeReportKeys.versions(report), (http, signal) =>
    listVersions(http, report, signal),
  );
}

export function useReportVersion(id: string | null) {
  return useApiQuery(
    programmeReportKeys.version(id ?? ''),
    (http, signal) => getVersion(http, id ?? '', signal),
    { enabled: id !== null },
  );
}

/** Approving or correcting adds a version and supersedes another, so every version list is refetched. */
function useVersionWrite<Input>(write: (input: Input) => Promise<unknown>, done: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => {
      toast.success(done);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: [ROOT, 'versions'] }),
    // The dialog shows the failure next to the note or reason.
    meta: { handlesOwnErrors: true },
  });
}

export function useApproveVersion() {
  const http = useHttp();
  return useVersionWrite(
    (input: Parameters<typeof approveVersion>[1]) => approveVersion(http, input),
    'Report version approved. Its figures are saved as shown.',
  );
}

export function useCorrectVersion() {
  const http = useHttp();
  const queryClient = useQueryClient();
  return useVersionWrite(async ({ id, reason }: { id: string; reason: string }) => {
    const corrected = await correctVersion(http, id, reason);
    await queryClient.invalidateQueries({ queryKey: programmeReportKeys.version(id) });
    return corrected;
  }, 'Correction saved as a new version. The earlier version is kept unchanged.');
}
