import type { PanelPayment } from '@/components/caixa/panel-state';

/**
 * Keyboard shortcuts of the counter sale (atalhos de teclado no balcão, 2026-10-26). Only keys the browser leaves
 * free: F5, F6, Ctrl+number and Alt+letter reload the page, move the focus or switch tabs, so they are never used.
 * A key typed in a field is the field's, except F2 and Ctrl+Enter.
 */

export type CounterAction = 'focusSearch' | 'next' | 'prev' | 'pick' | 'leaveSearch' | 'finish' | `pay:${PanelPayment['method']}`;

const PAY: Record<string, PanelPayment['method']> = { '1': 'dinheiro', '2': 'pix', '3': 'cartao de credito', '4': 'cartao de debito' };

export function counterKeyAction(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; inField: boolean; inSearch: boolean }): CounterAction | null {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) return 'finish';
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'F2') return 'focusSearch';
  if (e.inSearch) {
    if (e.key === 'ArrowDown') return 'next';
    if (e.key === 'ArrowUp') return 'prev';
    if (e.key === 'Enter') return 'pick';
    if (e.key === 'Escape') return 'leaveSearch';
    return null;
  }
  if (e.inField) return null;
  if (e.key === '/') return 'focusSearch';
  if (PAY[e.key]) return `pay:${PAY[e.key]}`;
  return null;
}

export const COUNTER_KEYS_LEGEND = 'Teclado: F2 busca · ↑ ↓ e Enter adicionam o item · Esc sai da busca · 1 Dinheiro · 2 PIX · 3 Crédito · 4 Débito · Ctrl+Enter finaliza';
