import { redirect } from 'next/navigation';

// Removed 2026-10-23 (owner): an Abacus chatbot window with no link; the Central de ajuda and the Pergunte ao Gastrux chat do this
export default function OldPage() {
  redirect('/ajuda');
}
