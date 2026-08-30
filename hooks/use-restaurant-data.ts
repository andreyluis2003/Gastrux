/**
 * FASE 38: Optimized Data Fetching Hooks
 * Uses React Query for intelligent caching and background updates
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys, staleTimes } from '@/lib/query-client';
import { toast } from 'sonner';

// ============================================================
// INGREDIENTS HOOKS
// ============================================================

export function useIngredients(restaurantId: string | undefined) {
  return useQuery({
    queryKey: restaurantId ? queryKeys.ingredients(restaurantId) : ['ingredients', 'none'],
    queryFn: async () => {
      if (!restaurantId) return [];
      const res = await fetch(`/api/ingredients`);
      if (!res.ok) throw new Error('Failed to fetch ingredients');
      return res.json();
    },
    enabled: !!restaurantId,
    staleTime: staleTimes.master,
    placeholderData: (previousData) => previousData,
  });
}

export function useIngredient(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.ingredient(id) : ['ingredient', 'none'],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/ingredients/${id}`);
      if (!res.ok) throw new Error('Failed to fetch ingredient');
      return res.json();
    },
    enabled: !!id,
    staleTime: staleTimes.master,
  });
}

// ============================================================
// STOCK HOOKS
// ============================================================

export function useStock(restaurantId: string | undefined) {
  return useQuery({
    queryKey: restaurantId ? queryKeys.stock(restaurantId) : ['stock', 'none'],
    queryFn: async () => {
      if (!restaurantId) return [];
      const res = await fetch(`/api/stock`);
      if (!res.ok) throw new Error('Failed to fetch stock');
      return res.json();
    },
    enabled: !!restaurantId,
    staleTime: staleTimes.dynamic,
    refetchInterval: 1000 * 60 * 2, // Refetch every 2 minutes
  });
}

export function useAlerts(restaurantId: string | undefined) {
  return useQuery({
    queryKey: restaurantId ? queryKeys.alerts(restaurantId) : ['alerts', 'none'],
    queryFn: async () => {
      if (!restaurantId) return [];
      const res = await fetch(`/api/alerts`);
      if (!res.ok) throw new Error('Failed to fetch alerts');
      return res.json();
    },
    enabled: !!restaurantId,
    staleTime: staleTimes.realtime,
    refetchInterval: 1000 * 30, // Refetch every 30 seconds
  });
}

// ============================================================
// RECIPES HOOKS
// ============================================================

export function useRecipes(restaurantId: string | undefined) {
  return useQuery({
    queryKey: restaurantId ? queryKeys.recipes(restaurantId) : ['recipes', 'none'],
    queryFn: async () => {
      if (!restaurantId) return [];
      const res = await fetch(`/api/recipes`);
      if (!res.ok) throw new Error('Failed to fetch recipes');
      return res.json();
    },
    enabled: !!restaurantId,
    staleTime: staleTimes.master,
  });
}

// ============================================================
// DASHBOARD HOOKS
// ============================================================

export function useDashboardMetrics(restaurantId: string | undefined) {
  return useQuery({
    queryKey: restaurantId ? queryKeys.dashboardMetrics(restaurantId) : ['dashboard-metrics', 'none'],
    queryFn: async () => {
      if (!restaurantId) return null;
      const res = await fetch(`/api/analytics/metrics`);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    enabled: !!restaurantId,
    staleTime: staleTimes.realtime,
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}

// ============================================================
// MUTATIONS WITH CACHE INVALIDATION
// ============================================================

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create ingredient');
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate ingredients list
      queryClient.invalidateQueries({ queryKey: queryKeys.ingredients(variables.restaurantId) });
      // Also invalidate stock since new ingredient affects it
      queryClient.invalidateQueries({ queryKey: queryKeys.stock(variables.restaurantId) });
      toast.success('Ingrediente criado com sucesso');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar ingrediente');
    },
  });
}

export function useUpdateStock() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/stock/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update stock');
      return res.json();
    },
    onSuccess: (_, variables) => {
      // Invalidate stock and alerts
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Estoque atualizado');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar estoque');
    },
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (alertId: string) => {
      const res = await fetch(`/api/alerts/${alertId}/dismiss`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to dismiss alert');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alerta dispensado');
    },
  });
}
