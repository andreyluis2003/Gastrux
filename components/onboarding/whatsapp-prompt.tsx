'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WHATSAPP_CONSENT_TEXT, parseWhatsapp } from '@/lib/onboarding/whatsapp';

const SNOOZE_KEY = 'gx_whatsapp_prompt_until';
const SNOOZE_MS = 7 * 86_400_000;

function snoozed() {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {}
}

/**
 * Accounts from before the sign-up asked for the WhatsApp (2026-11-01): the owner fills it in once
 * after logging in. "Agora não" hides it for 7 days on this device; the opt-in stays unticked.
 */
export function WhatsappPrompt() {
  const { data: session } = useSession() || ({} as any);
  const user = session?.user as { role?: string; isPlatformAdmin?: boolean } | undefined;
  const isOwner = user?.role === 'OWNER' && !user?.isPlatformAdmin;
  const [show, setShow] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOwner || snoozed()) return;
    let alive = true;
    fetch('/api/conta/whatsapp')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d?.needed && setShow(true))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isOwner]);

  if (!show) return null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/conta/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp, whatsappMarketing: marketing }),
      });
      if (res.ok || res.status === 409) {
        setShow(false);
        if (res.ok) toast.success('WhatsApp salvo');
        return;
      }
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Não foi possível salvar. Tente de novo.');
    } catch {
      toast.error('Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="whatsapp-prompt-title" className="w-full max-w-sm space-y-3 rounded-lg bg-card p-5 shadow-lg">
        <h2 id="whatsapp-prompt-title" className="text-lg font-semibold">Qual é o seu WhatsApp?</h2>
        <p className="text-sm text-muted-foreground">Assim a Equipe Gastrux consegue falar com você se precisar ajudar na sua conta.</p>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-label="Seu WhatsApp com DDD"
          placeholder="(66) 99999-9999"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          disabled={saving}
        />
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>{WHATSAPP_CONSENT_TEXT}</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            disabled={saving}
            onClick={() => {
              snooze();
              setShow(false);
            }}
          >
            Agora não
          </Button>
          <Button onClick={save} disabled={saving || !parseWhatsapp(whatsapp).ok}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}
