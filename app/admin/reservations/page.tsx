import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner): a hidden screen nobody reached, and its reminder never worked. The tables stay until
// the owner confirms what production holds
export default function OldReservationsPage() {
  redirect('/dashboard');
}
