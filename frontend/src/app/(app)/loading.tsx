'use client';

import { usePathname } from 'next/navigation';

import { PageSkeleton } from '@/components/states/PageSkeleton';
import { findScreen } from '@/navigation/navigation';
import { workspaces } from '@/navigation/workspaces';

/** Shown inside the shell while a page loads, in the shape of that page. */
export default function Loading() {
  const pathname = usePathname();
  return <PageSkeleton layout={findScreen(workspaces, pathname)?.layout ?? 'table'} />;
}
