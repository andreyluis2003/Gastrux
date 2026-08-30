'use client';

import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

/**
 * CRITICAL - Renders immediately
 * Quick stats (critical, low, OK) and filter bar
 */
export function StockCriticalSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<StockCriticalSkeleton />}>
      {children}
    </Suspense>
  );
}

/**
 * HIGH - Renders after 100-200ms
 * Critical items list and category summary
 */
export function StockHighSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<StockHighSkeleton />}>
      <div className="animate-fadeIn">{children}</div>
    </Suspense>
  );
}

/**
 * MEDIUM - Renders after 400-600ms
 * All filtered items
 */
export function StockMediumSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<StockMediumSkeleton />}>
      <div className="animate-fadeIn delay-300">{children}</div>
    </Suspense>
  );
}

/**
 * LOW - Renders last
 * Analytics and recommendations
 */
export function StockLowSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<StockLowSkeleton />}>
      <div className="animate-fadeIn delay-500">{children}</div>
    </Suspense>
  );
}

// SKELETONS

function StockCriticalSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4">
            <LoadingSkeleton className="h-6 w-12 mb-2" />
            <LoadingSkeleton className="h-3 w-20" />
          </Card>
        ))}
      </div>
      <LoadingSkeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

function StockHighSkeleton() {
  return (
    <div className="space-y-4 mt-4">
      <LoadingSkeleton className="h-6 w-32 mb-3" />
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <LoadingSkeleton className="h-4 w-1/2 mb-2" />
              <LoadingSkeleton className="h-3 w-1/3" />
            </div>
            <LoadingSkeleton className="h-8 w-16" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function StockMediumSkeleton() {
  return (
    <div className="space-y-3 mt-4">
      {[...Array(10)].map((_, i) => (
        <Card key={i} className="p-3">
          <LoadingSkeleton className="h-4" />
        </Card>
      ))}
    </div>
  );
}

function StockLowSkeleton() {
  return (
    <div className="space-y-4 mt-6">
      <LoadingSkeleton className="h-6 w-32" />
      <LoadingSkeleton className="h-24" />
    </div>
  );
}
