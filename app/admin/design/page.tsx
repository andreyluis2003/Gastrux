import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): a sample of components
export default function OldPage() {
  redirect('/dashboard');
}
