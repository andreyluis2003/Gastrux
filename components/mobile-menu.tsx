'use client';

import { useState } from 'react';
import { Menu, X, Home, UtensilsCrossed, ClipboardList, ShoppingCart, TrendingDown, BarChart3, AlertCircle, LogOut, Settings, Calculator, Trash2, PieChart, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { Button } from './ui/button';
import { toast } from 'sonner';

const menuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/insumos', label: 'Insumos', icon: UtensilsCrossed },
  { href: '/receitas', label: 'Receitas', icon: ClipboardList },
  { href: '/estoque', label: 'Estoque', icon: ShoppingCart },
  { href: '/contagem', label: 'Contagem', icon: ClipboardCheck },
  { href: '/compras', label: 'Compras', icon: ShoppingCart },
  { href: '/cmv', label: 'CMV', icon: Calculator },
  { href: '/desperdicio', label: 'Desperdício', icon: Trash2 },
  { href: '/engenharia-cardapio', label: 'Eng. Cardápio', icon: PieChart },
  { href: '/alertas', label: 'Alertas', icon: AlertCircle },
];

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { data: session } = useSession() || {};

  const handleLogout = async () => {
    try {
      await signOut({ redirect: true, callbackUrl: '/auth/signin' });
    } catch (error) {
      toast.error('Erro ao fazer logout');
    }
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-2.5 left-3 z-40 md:hidden p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-40 md:hidden transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 space-y-4">
          {/* Logo/Title */}
          <div className="mt-8 mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Gastrux</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Gestão de Produção</p>
          </div>

          {/* Menu Items */}
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="border-t border-slate-200 dark:border-slate-700 my-4" />

          {/* Settings & Logout — only when authenticated */}
          {session && (
            <div className="space-y-2">
              <Link
                href="/settings"
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <Settings className="h-5 w-5" />
                <span className="font-medium">Configurações</span>
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                <span className="font-medium">Sair</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
