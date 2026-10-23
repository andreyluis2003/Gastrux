import { redirect } from 'next/navigation';

// Removed 2026-10-23 with the old loyalty (owner: only cashback): a referral only gave points, which bought nothing.
// The cashback is on the Cashback screen (spec docs/superpowers/specs/2026-10-23-cashback-design.md)
export default function OldReferralPage() {
  redirect('/admin/cashback');
}
