'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** The link from the "esqueci minha senha" e-mail lands here (lib/auth/password-reset.ts). */
function RedefinirSenha() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Não foi possível redefinir a senha');
        return;
      }
      toast.success('Senha criada. Entre com a nova senha.');
      router.replace('/auth/signin');
    } finally {
      setSaving(false);
    }
  };

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        Link incompleto. <Link href="/auth/esqueci-senha" className="font-medium text-blue-600 hover:underline">Peça um novo link</Link>.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
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
      {error && (
        <p className="text-sm text-red-600">
          {error} <Link href="/auth/esqueci-senha" className="font-medium underline">Pedir novo link</Link>
        </p>
      )}
      <Button type="submit" className="w-full" disabled={saving || mismatch || tooShort || !next}>
        {saving ? 'Salvando...' : 'Criar nova senha'}
      </Button>
    </form>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold">Criar nova senha</h1>
        </div>
        <Suspense fallback={null}>
          <RedefinirSenha />
        </Suspense>
      </Card>
    </div>
  );
}
