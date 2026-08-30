'use client';

import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';

/**
 * CRITICAL - Renders immediately
 * Search bar, pagination info, first 5 recipes
 */
export function RecipesCriticalSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RecipesCriticalSkeleton />}>
      {children}
    </Suspense>
  );
}

/**
 * HIGH - Renders after 150-250ms
 * Recipes 6-15, pagination controls
 */
export function RecipesHighSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RecipesHighSkeleton />}>
      <div className="animate-fadeIn">{children}</div>
    </Suspense>
  );
}

/**
 * MEDIUM - Renders after 500-800ms
 * Recipes 16-20, related data
 */
export function RecipesMediumSection({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RecipesMediumSkeleton />}>
      <div className="animate-fadeIn delay-300">{children}</div>
    </Suspense>
  );
}

// SKELETONS

function RecipesCriticalSkeleton() {
  return (
    <div className="space-y-4">
      <LoadingSkeleton className="h-10 w-full rounded-lg" />
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-4">
            <LoadingSkeleton className="h-6 w-3/4 mb-2" />
            <LoadingSkeleton className="h-4 w-full mb-2" />
            <LoadingSkeleton className="h-3 w-1/2" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecipesHighSkeleton() {
  return (
    <div className="space-y-4 mt-4">
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-4">
            <LoadingSkeleton className="h-6 w-3/4 mb-2" />
            <LoadingSkeleton className="h-4 w-full mb-2" />
            <LoadingSkeleton className="h-3 w-1/2" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecipesMediumSkeleton() {
  return (
    <div className="space-y-4 mt-4">
      <div className="grid md:grid-cols-2 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="p-4">
            <LoadingSkeleton className="h-20" />
          </Card>
        ))}
      </div>
      <div className="flex justify-center gap-2 mt-6">
        <LoadingSkeleton className="h-10 w-20" />
        <LoadingSkeleton className="h-10 w-20" />
        <LoadingSkeleton className="h-10 w-20" />
      </div>
    </div>
  );
}
