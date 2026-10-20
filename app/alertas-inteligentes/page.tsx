import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): its rules never ran (no routine checked them)
export default function OldSmartAlertsPage() {
  redirect('/dashboard');
}
