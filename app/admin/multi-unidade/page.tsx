import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): it repeated Várias lojas with kitchen numbers
export default function OldPage() {
  redirect('/admin/multi-location');
}
