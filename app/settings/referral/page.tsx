import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner): it promised R$ 50 in credits that billing never used, and the ?ref= link was never read
export default function OldReferralPage() {
  redirect('/dashboard');
}
