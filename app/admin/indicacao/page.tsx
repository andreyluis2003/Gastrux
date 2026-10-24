import { redirect } from 'next/navigation';

// The old referral (points that bought nothing) was removed on 2026-10-23; the real program of 2026-10-24
// (plan indicacao) lives on Minha assinatura > Indique e ganhe
export default function OldReferralPage() {
  redirect('/dashboard/billing#indique');
}
