import { redirect } from 'next/navigation';

// The old page promised R$ 50 in credits that billing never used (removed 2026-10-23); the real program of
// 2026-10-24 (plan indicacao) lives on Minha assinatura > Indique e ganhe
export default function OldReferralPage() {
  redirect('/dashboard/billing#indique');
}
