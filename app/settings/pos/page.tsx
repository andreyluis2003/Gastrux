import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): Square/SumUp settings had no real integration
export default function OldPosSettingsPage() {
  redirect('/admin/settings');
}
