import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner): it repeated the bell and the Início (low stock, orders, waste) from an old
// alerts table nothing fed any more
export default function OldSmartAlertsPage() {
  redirect('/dashboard');
}
