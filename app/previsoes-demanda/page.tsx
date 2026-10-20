import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): it showed a day-of-week average as machine learning, with a fixed accuracy
export default function OldDemandForecastPage() {
  redirect('/dashboard');
}
