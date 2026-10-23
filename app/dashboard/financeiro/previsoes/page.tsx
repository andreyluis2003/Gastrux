import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner: fix the Financeiro screen): "Receita" was the average of one payment, "Pedidos" was
// always 1 and the confidence was fixed. The projection of the month is now on the Financeiro screen
export default function OldFinancialForecastsPage() {
  redirect('/dashboard/financeiro');
}
