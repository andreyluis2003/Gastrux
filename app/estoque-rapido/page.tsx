import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): quick stock entry duplicated Entrada em lote
export default function OldQuickStockPage() {
  redirect('/estoque/entrada');
}
