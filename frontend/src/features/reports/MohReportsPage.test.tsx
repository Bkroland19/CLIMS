import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RecordedRequest } from '@/test/fakeAdapter';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';
import { aReport, aSentReport } from '@/test/reportFixtures';

import MohReportsPage from './MohReportsPage';

const october = [
  aSentReport(),
  aSentReport({
    id: 'RPT-2610-GULU',
    unit: { id: 'GULU', name: 'Gulu district store', district: 'Gulu' },
    reporter: 'Okot Denis',
    reviewed_at: '2026-11-19T10:00:00Z',
  }),
  aSentReport({
    id: 'RPT-2610-HS0198',
    level: 'hotspot',
    unit: { id: 'HS-0198', name: 'Nansana Taxi Park', district: 'Wakiso' },
    reporter: 'Ronald Kizza',
  }),
  aReport({
    id: 'RPT-2610-NMS',
    level: 'warehouse',
    unit: { id: 'NMS', name: 'National Medical Stores', district: null },
    reporter: 'Daniel Ochieng',
    prefilled: ['opening', 'issued'],
  }),
];
const september = [
  aSentReport({
    id: 'RPT-2609-NMS',
    period: '2026-09',
    level: 'warehouse',
    unit: { id: 'NMS', name: 'National Medical Stores', district: null },
    reporter: 'Daniel Ochieng',
  }),
  aReport({
    id: 'RPT-2609-JMS',
    period: '2026-09',
    level: 'warehouse',
    unit: { id: 'JMS', name: 'Joint Medical Store', district: null },
    reporter: 'Paul Ssekandi',
  }),
];

function answer(request: RecordedRequest): { status: number; body: unknown } {
  const url = new URL(request.url, 'http://test');
  if (request.method === 'POST') return { status: 200, body: { success: true, data: null } };
  if (url.pathname === '/monthly-reports/periods') {
    return {
      status: 200,
      body: [
        { period: '2026-10', due_on: '2026-11-20' },
        { period: '2026-09', due_on: '2026-10-20' },
      ],
    };
  }
  if (url.pathname === '/monthly-reports/coverage') {
    return {
      status: 200,
      body: [
        { level: 'hotspot', expected: 412, submitted: 264 },
        { level: 'vht', expected: 1240, submitted: 702 },
        { level: 'district', expected: 146, submitted: 99 },
        { level: 'warehouse', expected: 2, submitted: 0 },
      ],
    };
  }
  if (url.pathname === '/monthly-reports') {
    return {
      status: 200,
      body: url.searchParams.get('period') === '2026-09' ? september : october,
    };
  }
  return { status: 404, body: { message: 'Not found' } };
}

const rowNames = () =>
  within(screen.getByRole('table', { name: /Monthly reports/ }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');

describe('MohReportsPage', () => {
  it('opens on the newest month with the reports MOH has received', async () => {
    renderApp(<MohReportsPage />, { route: '/moh/reports', signedIn: true, replies: [answer] });

    await screen.findByText('Gulu district store');
    expect(rowNames()).toEqual([
      expect.stringContaining('Wakiso district store'),
      expect.stringContaining('Gulu district store'),
      expect.stringContaining('Nansana Taxi Park'),
    ]);
    expect(screen.queryByText('National Medical Stores')).not.toBeInTheDocument();
    expect(screen.getByText('Districts reported: 99 of 146')).toBeInTheDocument();
  });

  it('puts the level and status filters in the address', async () => {
    const user = userEvent.setup();
    renderApp(<MohReportsPage />, { route: '/moh/reports', signedIn: true, replies: [answer] });
    await screen.findByText('Gulu district store');

    const levels = screen.getByRole('navigation', { name: 'Filter reports by level' });
    await user.click(within(levels).getByRole('link', { name: /Districts/ }));
    expect(testRouter.location).toBe('/moh/reports?month=2026-10&type=district');
    await waitFor(() => {
      expect(screen.queryByText('Nansana Taxi Park')).not.toBeInTheDocument();
    });
    expect(rowNames()).toHaveLength(2);

    const statuses = screen.getByRole('navigation', { name: 'Filter reports by status' });
    await user.click(within(statuses).getByRole('link', { name: /Not sent/ }));
    expect(testRouter.location).toBe('/moh/reports?month=2026-10&type=district&status=not_sent');
    expect(await screen.findByText('No reports match these filters')).toBeInTheDocument();
  });

  it('reads the month, level and status from the address', async () => {
    const { requests } = renderApp(<MohReportsPage />, {
      route: '/moh/reports?month=2026-09&type=warehouse&status=not_sent',
      signedIn: true,
      replies: [answer],
    });

    expect(await screen.findByText('Joint Medical Store')).toBeInTheDocument();
    expect(rowNames()).toEqual([expect.stringContaining('Joint Medical Store')]);
    expect(requests.map((request) => request.url)).toContain('/monthly-reports?period=2026-09');
    // A report that has not been sent cannot be opened, only chased.
    expect(screen.queryByRole('link', { name: 'Joint Medical Store' })).not.toBeInTheDocument();
  });

  it('changes month through the picker, keeping the other filters', async () => {
    const user = userEvent.setup();
    renderApp(<MohReportsPage />, {
      route: '/moh/reports?type=warehouse',
      signedIn: true,
      replies: [answer],
    });
    await screen.findByRole('navigation', { name: 'Filter reports by level' });

    await user.click(screen.getByRole('combobox', { name: 'Reporting month' }));
    await user.click(await screen.findByRole('option', { name: 'September 2026' }));
    expect(testRouter.location).toBe('/moh/reports?month=2026-09&type=warehouse');
    expect(await screen.findByText('National Medical Stores')).toBeInTheDocument();
  });

  it('reminds the reporter of a report that has not been sent', async () => {
    const user = userEvent.setup();
    const { requests } = renderApp(<MohReportsPage />, {
      route: '/moh/reports?status=not_sent',
      signedIn: true,
      replies: [answer],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Actions for National Medical Stores' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remind Daniel Ochieng' }));
    await waitFor(() => {
      expect(requests.find((request) => request.method === 'POST')?.url).toBe(
        '/monthly-reports/RPT-2610-NMS/remind',
      );
    });
  });
});
