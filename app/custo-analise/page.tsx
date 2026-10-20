import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): it read a price history never written; the cost shows in the ficha and the product
export default function OldCostAnalysisPage() {
  redirect('/receitas');
}
