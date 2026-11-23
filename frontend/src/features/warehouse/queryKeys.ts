// Shared with district stock: receiving or dispatching stock refreshes every affected view.
const ORDERS = 'warehouse-orders';
export const warehouseOrderKeys = {
  all: [ORDERS] as const,
  warehouses: [ORDERS, 'warehouses'] as const,
  orders: [ORDERS, 'orders'] as const,
  order: (id: string) => [ORDERS, 'orders', id] as const,
  events: (id: string) => [ORDERS, 'orders', id, 'events'] as const,
  stock: (storeId: string) => [ORDERS, 'stock', storeId] as const,
  batches: (storeId: string) => [ORDERS, 'batches', storeId] as const,
};

const STOCK = 'warehouse-stock';
export const warehouseStockKeys = {
  all: [STOCK] as const,
  movements: (storeId: string) => [STOCK, storeId, 'movements'] as const,
};
