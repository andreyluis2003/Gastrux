import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): the daily summary and alerts were written by Abacus, never configured in production
export default function OldPage() {
  redirect('/dashboard');
}
