'use client';

import { useWarehouseStore } from '@/features/warehouse/useWarehouseStore';

import ReportPage from './ReportPage';

/** One of the warehouse's monthly reports. The store stays in the links back to the list. */
export default function WarehouseReportPage() {
  const { href } = useWarehouseStore();
  return <ReportPage workspace="warehouse" linkTo={href} />;
}
