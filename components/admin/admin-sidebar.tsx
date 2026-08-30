'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Users,
  FileText,
  LogOut,
  Settings,
  ChevronDown,
  Menu,
  X,
  Home,
  AlertCircle,
  TrendingUp,
  ShieldCheck,
  Clock,
  DollarSign,
  Palette,
  Building2,
  Gauge,
  Mail,
  BookOpen,
  MessageSquare,
  Star,
  Rocket,
  Sparkles,
  CreditCard,
  ShoppingBag,
  Mic,
  PhoneCall,
  Megaphone,
  Plug,
  Target,
  Package,
  QrCode,
} from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  submenu?: NavItem[];
  // Restrict to Gastrux platform staff (role ADMIN). Hidden from restaurant tenants.
  platformOnly?: boolean;
}

const adminNavigation: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/admin',
    icon: <Home className="w-5 h-5" />,
  },
  {
    label: 'Platform',
    href: '/admin/platform',
    icon: <Gauge className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Clientes',
    href: '/admin/customers',
    icon: <Building2 className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Usuários',
    href: '/admin/users',
    icon: <Users className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Relatórios',
    href: '/dashboard/reports',
    icon: <FileText className="w-5 h-5" />,
    submenu: [
      { label: 'Vendas', href: '/dashboard/reports/sales', icon: <TrendingUp className="w-4 h-4" /> },
      { label: 'Lucratividade', href: '/dashboard/reports/profitability', icon: <DollarSign className="w-4 h-4" /> },
      { label: 'Previsão de Demanda', href: '/dashboard/reports/demand', icon: <BarChart3 className="w-4 h-4" /> },
      { label: 'Executivo (PDF)', href: '/relatorios', icon: <FileText className="w-4 h-4" /> },
      { label: 'Financeiro', href: '/dashboard/financeiro', icon: <DollarSign className="w-4 h-4" /> },
      { label: 'Estoque', href: '/estoque', icon: <BarChart3 className="w-4 h-4" /> },
      { label: 'Clientes (CRM)', href: '/dashboard/crm', icon: <Users className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Auditoria',
    href: '/admin/audit-logs',
    icon: <ShieldCheck className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Alertas',
    href: '/admin/alerts',
    icon: <AlertCircle className="w-5 h-5" />,
  },
  {
    label: 'Staff / RH',
    href: '/admin/staff',
    icon: <Clock className="w-5 h-5" />,
    submenu: [
      { label: 'Equipe', href: '/admin/staff', icon: <Users className="w-4 h-4" /> },
      { label: 'Turnos', href: '/admin/staff/shifts', icon: <Clock className="w-4 h-4" /> },
      { label: 'Comissões', href: '/admin/staff/commissions', icon: <DollarSign className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Multi-Loja',
    href: '/admin/multi-location',
    icon: <Building2 className="w-5 h-5" />,
  },
  {
    label: 'Onboarding',
    href: '/admin/onboarding',
    icon: <Mail className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Knowledge Base',
    href: '/admin/knowledge-base',
    icon: <BookOpen className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Suporte',
    href: '/admin/support',
    icon: <MessageSquare className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Feedback',
    href: '/admin/feedback',
    icon: <Star className="w-5 h-5" />,
  },
  {
    label: 'Roadmap',
    href: '/admin/roadmap',
    icon: <Rocket className="w-5 h-5" />,
  },
  {
    label: 'AI Insights',
    href: '/dashboard/ai-insights',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    label: 'Configurações IA',
    href: '/admin/ai-config',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    label: 'Combos Inteligentes',
    href: '/admin/combos-ia',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    label: 'Análise Temporal',
    href: '/admin/cardapio-temporal',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    label: 'QR Embalagem',
    href: '/admin/qr-embalagem',
    icon: <QrCode className="w-5 h-5" />,
  },
  {
    label: 'Campanha Reconquista',
    href: '/admin/campanha-reconquista',
    icon: <Megaphone className="w-5 h-5" />,
  },
  {
    label: 'ROI Migração',
    href: '/admin/migracao-roi',
    icon: <TrendingUp className="w-5 h-5" />,
  },
  {
    label: 'Lead Nurturing',
    href: '/admin/nurturing',
    icon: <Mail className="w-5 h-5" />,
    platformOnly: true,
  },
  {
    label: 'Integração PDV',
    href: '/admin/pdv',
    icon: <CreditCard className="w-5 h-5" />,
    badge: 'Novo',
  },
  {
    label: 'Compliance Fiscal',
    href: '/admin/fiscal',
    icon: <FileText className="w-5 h-5" />,
    badge: 'Novo',
  },
  {
    label: 'Integrações',
    href: '/admin/integrations',
    icon: <CreditCard className="w-5 h-5" />,
    submenu: [
      { label: 'Maquininha', href: '/admin/integrations/pos', icon: <CreditCard className="w-4 h-4" /> },
      { label: 'Delivery', href: '/admin/integrations/delivery', icon: <ShoppingBag className="w-4 h-4" /> },
      { label: 'Analytics Delivery', href: '/admin/integrations/delivery/analytics', icon: <TrendingUp className="w-4 h-4" /> },
      { label: 'WhatsApp Bot', href: '/admin/integrations/whatsapp', icon: <MessageSquare className="w-4 h-4" /> },
      { label: 'Conversas WhatsApp', href: '/admin/integrations/whatsapp/conversations', icon: <MessageSquare className="w-4 h-4" /> },
      { label: 'Agente de Voz', href: '/admin/integrations/voice', icon: <Mic className="w-4 h-4" /> },
      { label: 'Ligações', href: '/admin/integrations/voice/calls', icon: <PhoneCall className="w-4 h-4" /> },
      { label: 'Mensageria', href: '/admin/messaging/providers', icon: <Plug className="w-4 h-4" /> },
      { label: 'Templates', href: '/admin/messaging/templates', icon: <FileText className="w-4 h-4" /> },
      { label: 'Campanhas', href: '/admin/messaging/campaigns', icon: <Megaphone className="w-4 h-4" /> },
      { label: 'Analytics WhatsApp', href: '/admin/integrations/whatsapp/analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { label: 'Leads', href: '/admin/marketing/leads', icon: <Target className="w-4 h-4" />, platformOnly: true },
    ],
  },
  {
    label: 'Design',
    href: '/admin/design',
    icon: <Palette className="w-5 h-5" />,
  },
  {
    label: 'Configurações',
    href: '/admin/settings',
    icon: <Settings className="w-5 h-5" />,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession() || {};
  const [isOpen, setIsOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  // Only Gastrux platform staff (role ADMIN) see platform-internal links.
  const isPlatformAdmin = (session?.user as any)?.role === 'ADMIN';
  const navigation = adminNavigation
    .filter((item) => !item.platformOnly || isPlatformAdmin)
    .map((item) =>
      item.submenu
        ? { ...item, submenu: item.submenu.filter((s) => !s.platformOnly || isPlatformAdmin) }
        : item
    );

  const toggleSubmenu = (href: string) => {
    setExpandedMenus((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href]
    );
  };

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-blue-600 text-white rounded-lg"
        aria-label="Toggle sidebar"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-20"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col transition-transform duration-300 z-30',
          'md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="p-6 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold">Admin</h1>
              <p className="text-xs text-slate-400">Gastrux</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {navigation.map((item) => (
            <div key={item.href}>
              {item.submenu ? (
                <>
                  <button
                    onClick={() => toggleSubmenu(item.href)}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors',
                      isActive(item.href)
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:bg-slate-700'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform',
                        expandedMenus.includes(item.href) ? 'rotate-180' : ''
                      )}
                    />
                  </button>
                  {expandedMenus.includes(item.href) && (
                    <div className="pl-4 space-y-1 mt-1">
                      {item.submenu.map((subitem) => (
                        <Link
                          key={subitem.href}
                          href={subitem.href}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors',
                            isActive(subitem.href)
                              ? 'bg-blue-500 text-white'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                          )}
                        >
                          {subitem.icon}
                          {subitem.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors',
                    isActive(item.href)
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  )}
                >
                  {item.icon}
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* Logout button */}
        <div className="p-4 border-t border-slate-700 flex-shrink-0">
          <button
            onClick={() => signOut({ redirect: true, callbackUrl: '/auth/signin' })}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
