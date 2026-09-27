'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Asks for the e-mail; the answer is the same whether or not the account exists. */
export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch('/api/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(data.message || 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.');
    } catch {
      setMessage('Não foi possível enviar agora. Confira a sua conexão e tente de novo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-900">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-lg font-semibold">Esqueci minha senha</h1>
        </div>
        {message ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">O link vale por 1 hora.</p>
            <Link href="/auth/signin" className="text-sm font-medium text-blue-600 hover:underline">Voltar para o login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Digite o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
            </p>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">E-mail</label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={sending || !email}>
              {sending ? 'Enviando...' : 'Enviar link'}
            </Button>
            <Link href="/auth/signin" className="block text-center text-sm text-muted-foreground hover:underline">Voltar para o login</Link>
          </form>
        )}
      </Card>
    </div>
  );
}
