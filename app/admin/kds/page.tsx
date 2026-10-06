import { redirect } from 'next/navigation';

// The kitchen screen moved to /cozinha (outside the admin area, so the cook can open it)
export default function OldKdsPage() {
  redirect('/cozinha');
}
