import { redirect } from 'next/navigation';

/** A comanda opens on the quick comanda screen (spec 2026-10-07, 4.2) */
export default function ComandaSessionRedirect({ params }: { params: { sessionId: string } }) {
  redirect(`/vender/${params.sessionId}`);
}
