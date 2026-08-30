'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { Palette, FileText } from 'lucide-react';
import { ThemeCustomizer } from '@/components/theme-customizer';

export default function DesignPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto p-4 sm:space-y-6 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackButton href="/admin" />
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                Design & Customização
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Personalize os temas e cores do seu restaurante
              </p>
            </div>
          </div>
          <Palette className="w-8 h-8 text-blue-600 dark:text-blue-400 hidden sm:block" />
        </div>

        {/* Tabs Navigation */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button className="px-4 py-2 font-medium border-b-2 border-blue-500 text-blue-600 dark:text-blue-400">
            <span className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Temas & Cores
            </span>
          </button>
          <button className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Guia de Estilos
            </span>
          </button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6">
          {/* Theme Customizer */}
          <Card className="p-4 sm:p-6">
            <ThemeCustomizer />
          </Card>

          {/* Quick Actions */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Ações Rápidas
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" className="gap-2">
                <span>📋</span>
                Exportar Configuração
              </Button>
              <Button variant="outline" className="gap-2">
                <span>📑</span>
                Importar Configuração
              </Button>
              <Button variant="outline" className="gap-2">
                <span>📸</span>
                Capturar Tema Atual
              </Button>
              <Button variant="outline" className="gap-2">
                <span>🔄</span>
                Restaurar Padrões
              </Button>
            </div>
          </Card>

          {/* Design Tips */}
          <Card className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              🏁 Dicas de Design
            </h2>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">1.</span>
                Cores primárias devem ser usadas para elementos interativos e calls-to-action
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">2.</span>
                Cores secundárias complementam a primária e criam visual interest
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">3.</span>
                Use cores de status (sucesso, aviso, erro) com moderacão
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">4.</span>
                Garanta contraste suficiente entre texto e fundo para acessibilidade
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">5.</span>
                Teste seu tema no modo claro e escuro
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
