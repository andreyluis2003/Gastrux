import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): its alerts only came from the removed quick stock entry
export default function OldAlertsPage() {
  redirect('/dashboard');
}
