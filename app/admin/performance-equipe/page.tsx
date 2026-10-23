import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): it counted kitchen orders, not the Caixa sales
export default function OldPage() {
  redirect('/admin/staff/commissions');
}
