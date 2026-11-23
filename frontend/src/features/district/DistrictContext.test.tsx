import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';

import { anOrder, JMS } from '@/test/dcfpFixtures';
import { testRouter } from '@/test/navigation';
import { renderApp } from '@/test/renderApp';
import { warehouseOrderApi } from '@/test/warehouseOrderFixtures';

import { DistrictContextProvider, useDistrictContext } from './DistrictContext';

function SelectedDistrict() {
  const district = useDistrictContext();
  return <output>{district?.district ?? 'Unfiltered'}</output>;
}

it('keeps the district across warehouse pages and clears it when the warehouse does not serve it', async () => {
  const user = userEvent.setup();
  renderApp(
    <DistrictContextProvider>
      <SelectedDistrict />
    </DistrictContextProvider>,
    {
      signedIn: true,
      route: '/warehouse?store=NMS',
      // NMS serves Wakiso and JMS serves Gulu: the districts whose stores ordered from them.
      replies: [
        warehouseOrderApi({
          orders: [
            anOrder({ id: 'o-nms', ordered_for_store_id: 'store-wakiso' }),
            anOrder({
              id: 'o-jms',
              ordered_for_store_id: 'store-gulu',
              ordered_from_store_id: JMS.id,
            }),
          ],
        }),
      ],
    },
  );

  const selector = screen.getByRole('combobox', { name: 'District' });
  await waitFor(() => expect(selector).toBeEnabled());
  await user.click(selector);
  await user.click(await screen.findByRole('option', { name: 'Wakiso' }));
  expect(screen.getByRole('status')).toHaveTextContent('Wakiso');

  act(() => {
    testRouter.push('/warehouse/requests?store=NMS');
  });
  expect(screen.getByRole('status')).toHaveTextContent('Wakiso');

  act(() => {
    testRouter.push('/warehouse/requests?store=JMS');
  });
  expect(screen.getByRole('status')).toHaveTextContent('Unfiltered');
  await waitFor(() => expect(selector).toBeEnabled());
  expect(selector).toHaveTextContent('All served districts');
});
