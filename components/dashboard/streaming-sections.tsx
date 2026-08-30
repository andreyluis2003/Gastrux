'use client';

import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

/**
 * CRITICAL Priority - Renders immediately
 * Quick stats and essential metrics
 */
export function CriticalStatsSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<CriticalStatsSkeleton />}>
      {children}
    </Suspense>
  );
}

/**
 * HIGH Priority - Renders after 100-200ms
 * Analytics cards and KPI metrics
 */
export function HighPrioritySection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<HighPrioritySkeleton />}>
      <div className="animate-fadeIn">{children}</div>
    </Suspense>
  );
}

/**
 * MEDIUM Priority - Renders after 500ms
 * Detailed lists and secondary data
 */
export function MediumPrioritySection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<MediumPrioritySkeleton />}>
      <div className="animate-fadeIn delay-300">{children}</div>
    </Suspense>
  );
}

/**
 * LOW Priority - Renders last (>1000ms)
 * Additional details and historical data
 */
export function LowPrioritySection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LowPrioritySkeleton />}>
      <div className="animate-fadeIn delay-500">{children}</div>
    </Suspense>
  );
}

// SKELETONS FOR EACH PRIORITY LEVEL

function CriticalStatsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <LoadingSkeleton className="h-8 w-12 mb-2" />
            <LoadingSkeleton className="h-4 w-24" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function HighPrioritySkeleton() {
  return (
    <div className="space-y-4 mt-6">
      <LoadingSkeleton className="h-6 w-32 mb-4" />
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="p-6">
            <LoadingSkeleton className="h-32" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function MediumPrioritySkeleton() {
  return (
    <div className="space-y-4 mt-6">
      <LoadingSkeleton className="h-6 w-32 mb-4" />
      <Card className="p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="py-3 border-b last:border-0">
            <LoadingSkeleton className="h-4 w-full mb-2" />
            <LoadingSkeleton className="h-3 w-3/4" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function LowPrioritySkeleton() {
  return (
    <div className="space-y-3 mt-6">
      <LoadingSkeleton className="h-5 w-32" />
      <LoadingSkeleton className="h-20" />
    </div>
  );
}
