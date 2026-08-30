'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { ChefHat, Chrome } from 'lucide-react';
import { useAnalytics } from '@/hooks/use-analytics';

export default function SignInPage() {
  const router = useRouter();
  const { trackLogin, trackEvent } = useAnalytics();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);

  useEffect(() => {
    // Track signin page view
    trackEvent('signin_form_start', { event_category: 'conversion' });
  }, [trackEvent]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(result.error);
      } else if (result?.ok) {
        // Track successful login
        trackLogin('email');
        toast.success('Login realizado com sucesso!');
        router.replace('/dashboard');
      }
    } catch (error) {
      toast.error('Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setIsLoadingGoogle(true);
    trackLogin('google');
    try {
      await signIn('google', {
        redirect: true,
        callbackUrl: '/dashboard',
      });
    } catch (error) {
      toast.error('Erro ao fazer login com Google');
      setIsLoadingGoogle(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center space-y-2">
          <ChefHat className="h-12 w-12 text-red-600" />
          <h1 className="text-2xl font-bold text-slate-900">Gastrux</h1>
          <p className="text-sm text-slate-600">Gestão de Produção</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
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

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
            loading={isLoading}
          >
            Entrar
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
          disabled={isLoadingGoogle}
          loading={isLoadingGoogle}
        >
          <Chrome className="mr-2 h-4 w-4" aria-hidden="true" />
          Entrar com Google
        </Button>

        <p className="text-center text-sm text-slate-600">
          Não tem uma conta?{' '}
          <Link href="/auth/signup" className="font-medium text-red-600 hover:underline">
            Crie uma agora
          </Link>
        </p>

      </div>
    </div>
  );
}
