import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): it promised scheduling rules that do not exist
export default function OldPage() {
  redirect('/admin/integrations/orders');
}
