export const processData = (data: any) => {
  const brandQuantities = data.reduce((acc: any, item: any) => {
    const brand = item?.condom_id?.brand;
    const quantity = parseInt(item.quantity_brought, 10);

    if (acc[brand]) {
      acc[brand] += quantity;
    } else {
      acc[brand] = quantity;
    }

    return acc;
  }, {});

  return Object.entries(brandQuantities)?.map(([key, value]) => ({ key, value: value as number }));
};
