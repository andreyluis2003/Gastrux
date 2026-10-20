import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): Square/SumUp sales had no real integration; sales are made in Vender
export default function OldQuickSalesPage() {
  redirect('/vender');
}
