'use client';

import type { ReactNode } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatTimestamp } from '@/lib/format';

import type { MonthlyReport } from './api';
import {
  ChecksCard,
  CommentCard,
  FactsCard,
  FiguresCard,
  HistoryCard,
  levelLabel,
  OtherDetailsCard,
  ReportHeader,
} from './ReportParts';
import { periodLabel, reportSteps, validationText } from './status';

interface SentReportProps {
  report: MonthlyReport;
  viewer: 'reporter' | 'moh';
  /** Under the submission facts, e.g. a download button. */
  actions?: ReactNode;
}

/** A report that has been sent: every figure read-only, with when and how it passed its checks. */
export function SentReport({ report, viewer, actions }: SentReportProps) {
  const now = new Date();
  const passed = validationText(report).replace('Passed', 'passed validation');
  const receipt = report.receipt ? ` Server receipt ${report.receipt}.` : '';
  const sentAt = formatTimestamp(report.submitted_at, now);

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        report={report}
        viewer={viewer}
        steps={reportSteps(report, { problems: null, isSending: false }, now)}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Alert variant="success">
            {viewer === 'moh' ? (
              <>
                <AlertTitle>Received {sentAt}</AlertTitle>
                <AlertDescription>
                  {report.reporter} sent this through CLIMS. It {passed}.{receipt}
                </AlertDescription>
              </>
            ) : (
              <>
                <AlertTitle>Sent to MOH {sentAt}</AlertTitle>
                <AlertDescription>
                  It {passed}.{receipt} Sent reports can&apos;t be edited: contact the MOH M&amp;E
                  team if something needs correcting.
                </AlertDescription>
              </>
            )}
          </Alert>
          <FiguresCard report={report} />
          <OtherDetailsCard report={report} />
          <CommentCard comment={report.comment} />
          <HistoryCard report={report} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <FactsCard
            title="Submission"
            items={[
              { label: 'Reported by', value: report.reporter },
              { label: 'Level', value: levelLabel(report) },
              { label: 'Period', value: periodLabel(report.period) },
              { label: 'Sent', value: sentAt },
              { label: 'Server receipt', value: report.receipt ?? '—' },
              { label: 'Validation', value: validationText(report) },
              {
                label: 'Reviewed by MOH',
                value: report.reviewed_at
                  ? [report.reviewed_by, formatTimestamp(report.reviewed_at, now)]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Not yet',
              },
            ]}
          >
            {actions}
          </FactsCard>
          <ChecksCard
            problems={[]}
            description={`Run ${report.validation_runs} time${report.validation_runs === 1 ? '' : 's'}`}
          />
        </div>
      </div>
    </div>
  );
}
