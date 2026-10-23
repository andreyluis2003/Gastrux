import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): combos were written by Abacus, never configured in production
export default function OldPage() {
  redirect('/engenharia-cardapio');
}
