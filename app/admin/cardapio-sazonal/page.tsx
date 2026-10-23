import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): it only switched items on and off, like the Cardápio digital
export default function OldPage() {
  redirect('/admin/cardapio');
}
