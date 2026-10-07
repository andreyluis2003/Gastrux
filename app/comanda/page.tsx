import { redirect } from 'next/navigation';

/** The comanda list became the Vender screen (spec 2026-10-07, 4.1); old links and installed apps land there */
export default function ComandaRedirect() {
  redirect('/vender');
}
