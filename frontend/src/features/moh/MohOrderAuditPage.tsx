'use client';

import { useParams } from 'next/navigation';

import { ActivityTimeline } from '@/components/ActivityTimeline';
import { DetailHeader } from '@/components/DetailHeader';
import { DetailList } from '@/components/DetailList';
import { SampleDataNotice } from '@/components/SampleData';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RecordView } from '@/components/RecordView';
import { ORDER_STATUS, REQUEST_STATUS } from '@/features/fulfilment/status';
import { EMPTY_VALUE, formatTimestamp } from '@/lib/format';

import type { OrderDetail } from './api';
import { auditEntries, orderExceptions, orderMetrics } from './audit';
import { MOH_PATHS } from './filters';
import { useNationalOrder } from './queries';

/** One hotspot order's full audit trail: every action on it and on its warehouse request. */
export default function MohOrderAuditPage() {
  const { id } = useParams<{ id: string }>();
  const order = useNationalOrder(id);
  return (
    <div className="flex flex-col gap-4">
      <SampleDataNotice subject="The order and its audit trail" />
      <RecordView
        query={order}
        layout="detail"
        noun="order"
        back={{ href: MOH_PATHS.orders, label: 'Back to hotspot orders' }}
      >
        {(data) => <OrderAudit detail={data} />}
      </RecordView>
    </div>
  );
}

function OrderAudit({ detail }: { detail: OrderDetail }) {
  const now = new Date();
  const { order, warehouse_request: request } = detail;
  const status = ORDER_STATUS[order.status];
  const entries = auditEntries(detail, now);
  const exceptions = orderExceptions(detail);
  const delivery = order.delivery;
  const place = [order.hotspot.name, order.hotspot.district && `${order.hotspot.district} district`]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title={order.id}
        status={<StatusBadge status={status.label} tone={status.tone} />}
        description={`${place} · raised by ${order.requested_by.name} (${order.requested_by.role})`}
      >
        <DetailList variant="grid" items={orderMetrics(detail, now)} />
      </DetailHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Audit trail</CardTitle>
            <CardDescription>
              Every action on this order and the warehouse request behind it, oldest first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-muted-foreground text-sm">No actions recorded yet.</p>
            ) : (
              <ActivityTimeline aria-label={`Audit trail for ${order.id}`} entries={entries} />
            )}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Delivery</CardTitle>
            </CardHeader>
            <CardContent>
              {delivery ? (
                <DetailList
                  items={[
                    { label: 'Delivery note', value: delivery.note_number },
                    { label: 'Rider', value: delivery.rider.name },
                    { label: 'Collected', value: formatTimestamp(delivery.collected_at, now) },
                    { label: 'Delivered', value: formatTimestamp(delivery.delivered_at, now) },
                    { label: 'Receipt confirmed', value: formatTimestamp(order.received_at, now) },
                  ]}
                />
              ) : (
                <p className="text-muted-foreground text-sm">Not handed to a rider yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Warehouse request</CardTitle>
            </CardHeader>
            <CardContent>
              {request ? (
                <DetailList
                  items={[
                    { label: 'Request', value: request.id },
                    { label: 'Warehouse', value: request.warehouse },
                    {
                      label: 'Status',
                      value: (
                        <StatusBadge
                          status={REQUEST_STATUS[request.status].label}
                          tone={REQUEST_STATUS[request.status].tone}
                        />
                      ),
                    },
                    { label: 'Waybill', value: request.dispatch?.waybill ?? EMPTY_VALUE },
                    { label: 'Goods received note', value: request.receipt?.grn ?? EMPTY_VALUE },
                  ]}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  None. The district store covered this order.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exceptions</CardTitle>
            </CardHeader>
            <CardContent>
              {exceptions.length === 0 ? (
                <p className="text-muted-foreground text-sm">None recorded.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {exceptions.map((exception) => (
                    <li key={exception.title} className="text-sm">
                      <p className="font-medium">{exception.title}</p>
                      <p className="text-muted-foreground">{exception.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
