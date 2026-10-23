import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner: only cashback): points, rewards and milestones never earned anything from a sale.
// The cashback (spec docs/superpowers/specs/2026-10-23-cashback-design.md) is on the Cashback screen
export default function OldLoyaltyPage() {
  redirect('/admin/cashback');
}
