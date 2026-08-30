'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { ChefHat, Chrome } from 'lucide-react';
import { useAnalytics } from '@/hooks/use-analytics';

export default function SignUpPage() {
  const router = useRouter();
  const { trackSignup, trackEvent } = useAnalytics();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    // Track signup page view
    trackEvent('signup_form_start', { event_category: 'conversion' });
  }, [trackEvent]);

  async function handleGoogleSignIn() {
    if (!acceptedTerms) {
      toast.error('Você precisa aceitar os Termos de Uso e a Política de Privacidade');
      return;
    }
    setIsLoadingGoogle(true);
    trackSignup('google');
    try {
      await signIn('google', {
        redirect: true,
        callbackUrl: '/dashboard',
      });
    } catch (error) {
      toast.error('Erro ao criar conta com Google');
      setIsLoadingGoogle(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();

    if (!acceptedTerms) {
      toast.error('Você precisa aceitar os Termos de Uso e a Política de Privacidade');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, acceptedTerms: true }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Erro ao criar conta');
        return;
      }

      // Track successful signup
      trackSignup('email');
      toast.success('Conta criada com sucesso!');

      // Auto-login
      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.ok) {
        // Track successful conversion
        trackEvent('signup_form_complete', { event_category: 'conversion', email });
        router.replace('/dashboard');
      }
    } catch (error) {
      toast.error('Erro ao criar conta');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center space-y-2">
          <ChefHat className="h-12 w-12 text-red-600" />
          <h1 className="text-2xl font-bold text-slate-900">Gastrux</h1>
          <p className="text-sm text-slate-600">Crie sua conta</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirme a Senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={e => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <span>
              Li e aceito os{' '}
              <Link href="/termos" target="_blank" className="text-blue-600 hover:underline">Termos de Uso</Link>
              {' '}e a{' '}
              <Link href="/privacidade" target="_blank" className="text-blue-600 hover:underline">Política de Privacidade</Link>
            </span>
          </label>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !acceptedTerms}
            loading={isLoading}
          >
            Criar Conta
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-slate-500">ou</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={isLoadingGoogle || !acceptedTerms}
          loading={isLoadingGoogle}
        >
          <Chrome className="mr-2 h-4 w-4" aria-hidden="true" />
          Criar com Google
        </Button>

        <p className="text-center text-sm text-slate-600">
          Já tem uma conta?{' '}
          <Link href="/auth/signin" className="font-medium text-red-600 hover:underline">
            Entre aqui
          </Link>
        </p>
      </div>
    </div>
  );
}
