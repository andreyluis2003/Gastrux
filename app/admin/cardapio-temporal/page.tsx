import { redirect } from 'next/navigation';

// Hidden screen removed 2026-10-23 (owner, review of the screens outside the menu): its history is on Engenharia de cardápio
export default function OldPage() {
  redirect('/engenharia-cardapio');
}
