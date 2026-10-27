'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { Chrome } from 'lucide-react';
import { GastruxLogo } from '@/components/brand/logo';
import { useAnalytics } from '@/hooks/use-analytics';
import { markSignupDone } from '@/components/analytics/meta-pixel';
import { normalizeReferralCode, REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE } from '@/lib/referrals/code';

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
  // Referral (plan 2026-10-24 indicacao): the code comes from ?ref=, the cookie the link left, or typed here
  const [referralCode, setReferralCode] = useState('');
  const [referrerName, setReferrerName] = useState<string | null>(null);

  useEffect(() => {
    // Track signup page view
    trackEvent('signup_form_start', { event_category: 'conversion' });
  }, [trackEvent]);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('ref');
    const fromCookie = document.cookie.split('; ').find((c) => c.startsWith(`${REFERRAL_COOKIE}=`))?.split('=')[1];
    if (fromUrl || fromCookie) setReferralCode(fromUrl || fromCookie || '');
  }, []);

  useEffect(() => {
    const code = normalizeReferralCode(referralCode);
    if (!code) { setReferrerName(null); return; }
    let alive = true;
    fetch(`/api/referrals/lookup?code=${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive) return;
        setReferrerName(body?.name ?? null);
        // "Entrar com Google" reads the code from this cookie on the server
        if (body?.name) document.cookie = `${REFERRAL_COOKIE}=${code}; max-age=${REFERRAL_COOKIE_MAX_AGE}; path=/; samesite=lax`;
      })
      .catch(() => alive && setReferrerName(null));
    return () => { alive = false; };
  }, [referralCode]);

  async function handleGoogleSignIn() {
    if (!acceptedTerms) {
      toast.error('Você precisa aceitar os Termos de Uso e a Política de Privacidade');
      return;
    }
    setIsLoadingGoogle(true);
    trackSignup('google');
    markSignupDone();
    try {
      await signIn('google', {
        redirect: true,
        callbackUrl: '/auth/qualification',
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
        body: JSON.stringify({ email, password, name, acceptedTerms: true, referralCode: referralCode || undefined }),
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
        markSignupDone();
        router.replace('/auth/qualification');
      }
    } catch (error) {
      toast.error('Erro ao criar conta');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-paper font-brand">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center space-y-2">
          <h1><GastruxLogo className="h-16" /></h1>
          <p className="text-sm text-slate-600">Crie sua conta</p>
        </div>

        {referrerName && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-center text-sm text-green-800">
            Indicado por <strong>{referrerName}</strong>: 45 dias grátis
          </div>
        )}

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

          <div className="space-y-2">
            <Label htmlFor="referralCode">Código de indicação (opcional)</Label>
            <Input
              id="referralCode"
              type="text"
              placeholder="Ex.: ABC23D"
              value={referralCode}
              maxLength={12}
              onChange={(e) => setReferralCode(e.target.value)}
              disabled={isLoading}
              autoCapitalize="characters"
            />
            {referralCode.trim() && !referrerName && normalizeReferralCode(referralCode) && (
              <p className="text-xs text-slate-500">Código não encontrado: o teste grátis fica com 30 dias.</p>
            )}
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
              <Link href="/termos" target="_blank" className="text-brand-green hover:underline">Termos de Uso</Link>
              {', a '}
              <Link href="/privacidade" target="_blank" className="text-brand-green hover:underline">Política de Privacidade</Link>
              {' e autorizo o tratamento dos meus dados conforme a LGPD (Lei Geral de Proteção de Dados)'}
            </span>
          </label>

          <Button
            type="submit"
            variant="cta"
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
          <Link href="/auth/signin" className="font-medium text-brand-green hover:underline">
            Entre aqui
          </Link>
        </p>
      </div>
    </div>
  );
}
