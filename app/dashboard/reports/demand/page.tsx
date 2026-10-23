import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner rule of 2026-10-19: hidden screens go, the old address redirects). The demand
// forecast was no longer sold on the site and its PDF export was a placeholder; the reports live in Financeiro
export default function OldReportsPage() {
  redirect('/dashboard/financeiro');
}
