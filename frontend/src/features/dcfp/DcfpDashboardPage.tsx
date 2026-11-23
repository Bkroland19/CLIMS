'use client';

import { AlertTriangle, PackageCheck, Truck, Warehouse } from 'lucide-react';
import Link from 'next/link';

import { StatCard, StatCardGrid } from '@/components/StatCard';
import { TaskList } from '@/components/TaskList';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EMPTY_VALUE, formatNumber, formatTimestamp } from '@/lib/format';

import {
  dcfpTasks,
  DCFP_PATHS,
  isWithWarehouse,
  placeOf,
  recentReports,
  warehouseOrders,
} from './orders';
import { useOrders, useStockouts } from './queries';
import { useOrderNames } from './useOrderNames';

const LATEST_REPORTS = 5;

/** What needs the DCFP today: stock to receive, stockouts to answer, orders with the warehouse. */
export default function DcfpDashboardPage() {
  const reports = useStockouts();
  const allOrders = useOrders();
  const names = useOrderNames();
  const now = new Date();

  const orders =
    allOrders.data && names.warehouses
      ? warehouseOrders(allOrders.data, names.warehouses)
      : undefined;
  const count = (value: number | undefined) =>
    value === undefined ? EMPTY_VALUE : formatNumber(value);
  const loadingOrders = allOrders.isPending || names.isPending;

  return (
    <div className="flex flex-col gap-6">
      <StatCardGrid>
        <StatCard
          label="Stockouts this week"
          value={count(reports.data && recentReports(reports.data, now).length)}
          icon={AlertTriangle}
          accent="caution"
          href={DCFP_PATHS.stockouts}
          isLoading={reports.isPending}
        />
        <StatCard
          label="With the warehouse"
          value={count(orders?.filter(isWithWarehouse).length)}
          icon={Warehouse}
          accent="info"
          href={DCFP_PATHS.orders}
          isLoading={loadingOrders}
        />
        <StatCard
          label="On the way to you"
          value={count(orders?.filter((order) => order.order_status === 'dispatched').length)}
          icon={Truck}
          accent="violet"
          href={DCFP_PATHS.orders}
          isLoading={loadingOrders}
        />
        <StatCard
          label="Received"
          value={count(orders?.filter((order) => order.order_status === 'received').length)}
          icon={PackageCheck}
          accent="positive"
          href={DCFP_PATHS.orders}
          isLoading={loadingOrders}
        />
      </StatCardGrid>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <TaskList
          title="Needs your action"
          tasks={
            reports.data && orders
              ? dcfpTasks(
                  reports.data,
                  orders,
                  { product: names.product, warehouse: names.warehouseLabel },
                  now,
                  (iso) => formatTimestamp(iso),
                )
              : undefined
          }
          isLoading={reports.isPending || loadingOrders}
          error={reports.error ?? allOrders.error ?? names.error}
          errorTitle="Could not load your tasks"
          onRetry={() => {
            void reports.refetch();
            void allOrders.refetch();
            names.refetch();
          }}
          isRetrying={reports.isRefetching || allOrders.isRefetching}
          loadingLabel="Loading tasks…"
          empty={{
            title: 'Nothing needs you right now',
            description:
              'Stockouts reported by hotspots and stock arriving from the warehouse appear here.',
          }}
        />

        <Card className="lg:self-start">
          <CardHeader>
            <CardTitle>Latest stockouts</CardTitle>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href={DCFP_PATHS.stockouts}>View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {reports.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : !reports.data || reports.data.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {reports.isError ? 'Could not load stockout reports.' : 'No stockouts reported.'}
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {reports.data.slice(0, LATEST_REPORTS).map((report) => (
                  <li key={report.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm font-medium">
                      {report.hot_spot.name} · {report.product}
                    </span>
                    {report.comment ? (
                      <span className="line-clamp-2 text-sm">{report.comment}</span>
                    ) : null}
                    <span className="text-muted-foreground text-xs">
                      {[placeOf(report), formatTimestamp(report.created_at)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
