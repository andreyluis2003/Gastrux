import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner): it monitored that Abacus chatbot
export default function OldPage() {
  redirect('/admin/platform/ia');
}
