/**
 * FASE 38: React Query Client Configuration
 * Optimized caching for restaurant management data patterns
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data freshness strategy
      staleTime: 1000 * 60 * 5, // 5 minutes - data considered fresh
      gcTime: 1000 * 60 * 30,   // 30 minutes - garbage collection (formerly cacheTime)
      
      // Retry strategy
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.status >= 400 && error?.status < 500) return false;
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Refetch strategy
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: 'always',
      
      // Performance
      refetchInterval: false,
      networkMode: 'online',
    },
    mutations: {
      retry: false,
      networkMode: 'online',
    },
  },
});

/**
 * Query key factory for consistent cache keys
 */
export const queryKeys = {
  // Restaurant context
  restaurant: (id: string) => ['restaurant', id] as const,
  
  // Ingredients
  ingredients: (restaurantId: string) => ['ingredients', restaurantId] as const,
  ingredient: (id: string) => ['ingredient', id] as const,
  ingredientCategories: (restaurantId: string) => ['ingredient-categories', restaurantId] as const,
  
  // Recipes
  recipes: (restaurantId: string) => ['recipes', restaurantId] as const,
  recipe: (id: string) => ['recipe', id] as const,
  
  // Stock
  stock: (restaurantId: string) => ['stock', restaurantId] as const,
  stockMovements: (restaurantId: string) => ['stock-movements', restaurantId] as const,
  
  // Production
  productionPlans: (restaurantId: string) => ['production-plans', restaurantId] as const,
  
  // Shopping
  shoppingLists: (restaurantId: string) => ['shopping-lists', restaurantId] as const,
  
  // Suppliers
  suppliers: (restaurantId: string) => ['suppliers', restaurantId] as const,
  
  // Alerts
  alerts: (restaurantId: string) => ['alerts', restaurantId] as const,
  
  // Dashboard
  dashboard: (restaurantId: string) => ['dashboard', restaurantId] as const,
  dashboardMetrics: (restaurantId: string) => ['dashboard-metrics', restaurantId] as const,
  
  // Analytics
  analytics: (restaurantId: string, period?: string) => ['analytics', restaurantId, period] as const,
  
  // Financial
  financial: (restaurantId: string, period?: string) => ['financial', restaurantId, period] as const,
  
  // Reports
  reports: (restaurantId: string) => ['reports', restaurantId] as const,
  
  // User
  user: () => ['user'] as const,
  session: () => ['session'] as const,
  
  // Notifications
  notifications: () => ['notifications'] as const,
} as const;

/**
 * Stale time configurations by data volatility
 */
export const staleTimes = {
  // Ultra-stable: reference data, categories
  static: 1000 * 60 * 60 * 24, // 24 hours
  
  // Master data: ingredients, recipes, suppliers (change infrequently)
  master: 1000 * 60 * 60, // 1 hour
  
  // Dynamic: stock, production plans (change multiple times/day)
  dynamic: 1000 * 60 * 5, // 5 minutes
  
  // Real-time: alerts, dashboard metrics
  realtime: 1000 * 30, // 30 seconds
  
  // Never stale: user data, auth
  user: 0, // Always check, but cache for navigation
} as const;

/**
 * Helper to invalidate all restaurant-scoped queries
 */
export function invalidateRestaurantData(restaurantId: string) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return key.length > 1 && key[1] === restaurantId;
    },
  });
}

/**
 * Helper to prefetch common data for a restaurant
 */
export async function prefetchRestaurantData(restaurantId: string) {
  const prefetches = [
    queryClient.prefetchQuery({
      queryKey: queryKeys.ingredients(restaurantId),
      queryFn: () => fetch(`/api/ingredients?restaurantId=${restaurantId}`).then(r => r.json()),
      staleTime: staleTimes.master,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.stock(restaurantId),
      queryFn: () => fetch(`/api/stock?restaurantId=${restaurantId}`).then(r => r.json()),
      staleTime: staleTimes.dynamic,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.alerts(restaurantId),
      queryFn: () => fetch(`/api/alerts?restaurantId=${restaurantId}`).then(r => r.json()),
      staleTime: staleTimes.realtime,
    }),
  ];
  
  await Promise.all(prefetches);
}
