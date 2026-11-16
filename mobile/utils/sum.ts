export const sumData = (data: any[]) => {
  let totalQuantityBrought = 0;
  let totalStockFound = 0;

  data.forEach((item) => {
    totalQuantityBrought += parseInt(item.quantity_brought, 10);
    totalStockFound += parseInt(item.stock_found, 10);
  });

  return {
    totalQuantityBrought,
    totalStockFound,
  };
};
