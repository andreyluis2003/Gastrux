import { redirect } from 'next/navigation';

// Removed 2026-10-19 (owner decision on the screens reachable only by address): voice orders needed Twilio and a key never set up
export default function OldVoiceTestPage() {
  redirect('/admin/settings');
}
