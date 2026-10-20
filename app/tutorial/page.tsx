import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): the old tutorial used menu names from before 2026-10; the help center replaced it
export default function OldTutorialPage() {
  redirect('/ajuda');
}
