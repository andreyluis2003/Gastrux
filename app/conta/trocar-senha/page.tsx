'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * First access with a password someone else chose (a hire, a reset): middleware.ts sends the user
 * here and the API answers 403 until the password is changed. Also usable any time.
 */
export default function TrocarSenhaPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setSaving(true);
    try {
      const res = await fetch('/api/conta/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Não foi possível trocar a senha');
        return;
      }
      await update(); // the session drops the "must change" flag
      toast.success('Senha trocada');
      router.replace('/dashboard');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Crie a sua senha</h1>
            <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
          </div>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Você entrou com uma senha provisória. Troque por uma senha só sua para continuar.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="current" className="mb-1 block text-sm font-medium">Senha provisória</label>
            <Input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="next" className="mb-1 block text-sm font-medium">Nova senha</label>
            <Input id="next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
            {tooShort && <p className="mt-1 text-xs text-red-600">Pelo menos 8 caracteres</p>}
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium">Repita a nova senha</label>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {mismatch && <p className="mt-1 text-xs text-red-600">As senhas não conferem</p>}
          </div>
          <Button type="submit" className="w-full" disabled={saving || mismatch || tooShort || !current || !next}>
            {saving ? 'Salvando...' : 'Trocar senha'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
