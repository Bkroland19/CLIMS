import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

import { RecordView } from './RecordView';

interface Order {
  id: string;
}

function Harness({ fetchOrder }: { fetchOrder: () => Promise<Order> }) {
  const query = useQuery<Order, ApiError>({
    queryKey: ['order'],
    queryFn: fetchOrder,
    retry: false,
  });
  return (
    <RecordView
      query={query}
      layout="detail"
      noun="order"
      back={{ href: '/dcfp/orders', label: 'Back to orders' }}
    >
      {(order) => <h1>Order {order.id}</h1>}
    </RecordView>
  );
}

function renderRecord(fetchOrder: () => Promise<Order>) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Harness fetchOrder={fetchOrder} />
    </QueryClientProvider>,
  );
}

describe('RecordView', () => {
  it('shows the layout skeleton while the record loads', () => {
    renderRecord(() => new Promise<Order>(() => undefined));
    expect(screen.getByRole('status')).toHaveTextContent('Loading page…');
  });

  it('says the record is not available and links back when it does not exist', async () => {
    renderRecord(() =>
      Promise.reject(new ApiError({ kind: 'not_found', message: 'Not found', status: 404 })),
    );

    expect(await screen.findByText("That order isn't available")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to orders' })).toHaveAttribute(
      'href',
      '/dcfp/orders',
    );
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('shows the failure with a retry that loads the record again', async () => {
    const fetchOrder = vi
      .fn<() => Promise<Order>>()
      .mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'Network down' }))
      .mockResolvedValueOnce({ id: 'ORD-1' });
    renderRecord(fetchOrder);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this order');
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByRole('heading', { name: 'Order ORD-1' })).toBeInTheDocument();
    expect(fetchOrder).toHaveBeenCalledTimes(2);
  });

  it('renders the page once the record has loaded', async () => {
    renderRecord(() => Promise.resolve({ id: 'ORD-7' }));
    expect(await screen.findByRole('heading', { name: 'Order ORD-7' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
