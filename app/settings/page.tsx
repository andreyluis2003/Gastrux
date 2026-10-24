import { redirect } from 'next/navigation';

// Old settings hub removed 2026-10-23 (owner): no link reached it, and it repeated Minha conta and Minha assinatura
export default function OldSettingsPage() {
  redirect('/conta');
}
