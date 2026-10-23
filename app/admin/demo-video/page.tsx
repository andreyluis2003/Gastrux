import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): no page showed the uploaded video
export default function OldPage() {
  redirect('/admin/platform');
}
