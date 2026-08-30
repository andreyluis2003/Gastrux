'use client';

import { Card } from '@/components/ui/card';
import { Sparkline } from '@/components/ui/sparkline';
import { GlassCard } from '@/components/ui/glass-card';
import { GradientSection } from '@/components/ui/gradient-section';
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Package,
  BookOpen,
  TrendingUp,
  Calendar,
  Zap,
  Receipt,
  DollarSign,
  Warehouse,
  ShoppingCart,
  Trash2,
  ClipboardCheck,
  ClipboardList,
  PieChart,
  Calculator,
  CreditCard,
  Bell,
  Settings,
  FileText,
  MessageSquare,
  BarChart3,
  Mail,
  Handshake,
  Users,
  Gift,
  QrCode,
  ChefHat,
  Armchair,
  Mic,
  Megaphone,
  Bike,
  Globe,
  Truck,
  BellRing,
  Building2,
  UserPlus,
  CalendarDays,
  Activity,
  Clock,
  Bot,
  ShieldAlert,
  Star,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Sparkles,
  Store,
  LineChart,
  Target,
  Radio,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/formatters';
import { ReactNode, useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n/translations';

const iconMap = {
  Package, BookOpen, TrendingUp, Calendar, Zap, Receipt, DollarSign,
  Warehouse, ShoppingCart, AlertCircle, CreditCard, Bell, Settings,
  FileText, MessageSquare, BarChart3, Mail, Handshake, Users, Gift,
  ClipboardList, QrCode, ChefHat, Armchair, Mic, Megaphone, Bike,
  Globe, Trash2, Truck, BellRing, Building2, UserPlus, CalendarDays,
  Activity, Clock, Bot, ShieldAlert,
} as const;

export interface DashboardContentProps {
  ingredientCount: number;
  recipeCount: number;
  recentPlans: any[];
  recentAlerts: any[];
  lowStockCount: number;
  modules: Array<{
    id: string;
    iconName: keyof typeof iconMap;
    href: string;
    color: string;
    accentColor: string;
  }>;
}

// ── Category definitions ───────────────────────────────────────
const CATEGORY_ORDER = [
  'essentials',
  'sales',
  'inventory',
  'financial',
  'analytics',
  'marketing',
  'communication',
  'advanced',
] as const;

type CategoryId = typeof CATEGORY_ORDER[number];

const CATEGORY_META: Record<CategoryId, { icon: any; gradient: string }> = {
  essentials:    { icon: Star,       gradient: 'from-emerald-500 to-teal-500' },
  sales:         { icon: Store,      gradient: 'from-blue-500 to-indigo-500' },
  inventory:     { icon: Warehouse,  gradient: 'from-orange-500 to-amber-500' },
  financial:     { icon: DollarSign,  gradient: 'from-green-500 to-emerald-500' },
  analytics:     { icon: LineChart,   gradient: 'from-purple-500 to-violet-500' },
  marketing:     { icon: Target,      gradient: 'from-pink-500 to-rose-500' },
  communication: { icon: Radio,       gradient: 'from-cyan-500 to-blue-500' },
  advanced:      { icon: Wrench,      gradient: 'from-slate-500 to-gray-500' },
};

const MODULE_CATEGORY: Record<string, CategoryId> = {
  // Essenciais
  'insumos': 'essentials',
  'receitas': 'essentials',
  'estoque': 'essentials',
  'compras': 'essentials',
  'planejamento': 'essentials',
  'cmv': 'essentials',

  // Vendas & Atendimento
  'cardapio-digital': 'sales',
  'qr-codes': 'sales',
  'mesas': 'sales',
  'comanda': 'sales',
  'kds': 'sales',
  'vendas-rapidas': 'sales',

  // Estoque & Fornecedores
  'estoque-rapido': 'inventory',
  'contagem': 'inventory',
  'desperdicio': 'inventory',
  'fornecedores-painel': 'inventory',
  'alertas': 'inventory',
  'nfe-import': 'inventory',
  'notas-fiscais': 'inventory',

  // Financeiro
  'financeiro': 'financial',
  'dre': 'financial',
  'custo-analise': 'financial',

  // Análise & Relatórios
  'relatorios': 'analytics',
  'engenharia-cardapio': 'analytics',
  'consumo-analise': 'analytics',
  'previsoes-demanda': 'analytics',
  'desperdicio-relatorio': 'analytics',
  'monitoring': 'analytics',
  'survey-analytics': 'analytics',

  // Marketing & CRM
  'crm': 'marketing',
  'loyalty': 'marketing',
  'cashback': 'marketing',
  'email-campaigns': 'marketing',
  'survey': 'marketing',
  'messaging-campaigns': 'marketing',
  'indicacao': 'marketing',

  // Comunicação & Delivery
  'whatsapp-bot': 'communication',
  'voice-agent': 'communication',
  'delivery-orders': 'communication',
  'delivery-site': 'communication',

  // Avançado
  'settings-pos': 'advanced',
  'alertas-inteligentes': 'advanced',
  'alertas-smart': 'advanced',
  'multi-unidade': 'advanced',
  'cardapio-sazonal': 'advanced',
  'performance-equipe': 'advanced',
  'agendamento': 'advanced',
  'partnerships': 'advanced',
  'beta-testers': 'advanced',
  'tutorial': 'advanced',
  'suporte-ia': 'advanced',
  'ia-monitoring': 'advanced',
  'escalonamento': 'advanced',
};

const DASHBOARD_MODE_KEY = 'gastrux-dashboard-mode';

// ── Component ──────────────────────────────────────────────────
export function DashboardContent({
  ingredientCount,
  recipeCount,
  recentPlans,
  recentAlerts,
  lowStockCount,
  modules,
}: DashboardContentProps) {
  const { t } = useI18n();
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['essentials']));
  const [mounted, setMounted] = useState(false);

  // Load preference from localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(DASHBOARD_MODE_KEY);
      if (saved === 'full') {
        setIsSimpleMode(false);
        setExpandedCategories(new Set(CATEGORY_ORDER));
      }
    } catch {}
  }, []);

  const toggleMode = () => {
    const newMode = !isSimpleMode;
    setIsSimpleMode(newMode);
    if (newMode) {
      setExpandedCategories(new Set(['essentials']));
    } else {
      setExpandedCategories(new Set(CATEGORY_ORDER));
    }
    try {
      localStorage.setItem(DASHBOARD_MODE_KEY, newMode ? 'simple' : 'full');
    } catch {}
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) {
        if (catId !== 'essentials') next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  // Group modules by category
  const grouped = new Map<CategoryId, typeof modules>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const mod of modules) {
    const cat = MODULE_CATEGORY[mod.id] || 'advanced';
    grouped.get(cat)!.push(mod);
  }

  // Categories to show
  const categoriesToShow = isSimpleMode
    ? CATEGORY_ORDER.filter(c => c === 'essentials')
    : CATEGORY_ORDER;

  const hiddenCount = isSimpleMode
    ? modules.length - (grouped.get('essentials')?.length || 0)
    : 0;

  return (
    <>
      {/* Stats Section */}
      <FadeIn>
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <GlassCard className="p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs sm:text-sm font-medium text-slate-600">{t('dashboard.stats.ingredients')}</p>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-green-600">
                <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>12%</span>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary mb-3">{ingredientCount}</p>
            <Sparkline data={[{value:20},{value:22},{value:20},{value:25},{value:28},{value:26},{value:30}]} color="hsl(142 71% 45%)" height={20} />
          </GlassCard>

          <GlassCard className="p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs sm:text-sm font-medium text-slate-600">{t('dashboard.stats.recipes')}</p>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-green-600">
                <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>8%</span>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary mb-3">{recipeCount}</p>
            <Sparkline data={[{value:15},{value:17},{value:16},{value:18},{value:19},{value:18},{value:20}]} color="hsl(142 71% 45%)" height={20} />
          </GlassCard>

          <GlassCard className="p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs sm:text-sm font-medium text-slate-600">{t('dashboard.stats.plans')}</p>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-blue-600">
                <ArrowUp className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>5%</span>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary mb-3">{recentPlans.length}</p>
            <Sparkline data={[{value:2},{value:2},{value:3},{value:2},{value:3},{value:3},{value:3}]} color="hsl(221 83% 53%)" height={20} />
          </GlassCard>

          <GlassCard className="p-4 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs sm:text-sm font-medium text-slate-600">{t('dashboard.stats.lowStock')}</p>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-red-600">
                <ArrowDown className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>3%</span>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-primary mb-3">{lowStockCount}</p>
            <Sparkline data={[{value:8},{value:7},{value:6},{value:5},{value:4},{value:3},{value:2}]} color="hsl(0 84% 60%)" height={20} />
          </GlassCard>
        </div>
      </FadeIn>

      {/* Quick Actions */}
      <FadeIn delay={0.05}>
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {t('dashboard.quickActions')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link href="/desperdicio">
              <Card className="p-4 hover:shadow-md transition-all cursor-pointer group border-red-100 hover:border-red-300 dark:border-red-900/30">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 group-hover:bg-red-100 transition-colors">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium">{t('dashboard.quickAction.registerLoss')}</span>
                </div>
              </Card>
            </Link>
            <Link href="/contagem">
              <Card className="p-4 hover:shadow-md transition-all cursor-pointer group border-blue-100 hover:border-blue-300 dark:border-blue-900/30">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 group-hover:bg-blue-100 transition-colors">
                    <ClipboardCheck className="h-5 w-5 text-blue-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium">{t('dashboard.quickAction.quickCount')}</span>
                </div>
              </Card>
            </Link>
            <Link href="/cmv">
              <Card className="p-4 hover:shadow-md transition-all cursor-pointer group border-emerald-100 hover:border-emerald-300 dark:border-emerald-900/30">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 group-hover:bg-emerald-100 transition-colors">
                    <Calculator className="h-5 w-5 text-emerald-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium">{t('dashboard.quickAction.cmv')}</span>
                </div>
              </Card>
            </Link>
            <Link href="/engenharia-cardapio">
              <Card className="p-4 hover:shadow-md transition-all cursor-pointer group border-purple-100 hover:border-purple-300 dark:border-purple-900/30">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 group-hover:bg-purple-100 transition-colors">
                    <PieChart className="h-5 w-5 text-purple-600" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium">{t('dashboard.quickAction.menuEng')}</span>
                </div>
              </Card>
            </Link>
          </div>
        </div>
      </FadeIn>

      {/* Alerts Section */}
      {recentAlerts.length > 0 && (
        <FadeIn delay={0.1}>
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-foreground flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              {t('dashboard.recentAlerts')}
            </h2>
            <div className="space-y-2">
              {recentAlerts.slice(0, 3).map((alert) => (
                <Card
                  key={alert.id}
                  className={`p-4 border-l-4 ${
                    alert.severity === 'CRITICAL' ? 'border-l-red-500 bg-red-50/50' :
                    alert.severity === 'HIGH' ? 'border-l-orange-500 bg-orange-50/50' :
                    'border-l-yellow-500 bg-yellow-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-foreground">{alert.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      <p className="text-xs text-muted-foreground/70 mt-2">{formatDate(alert.createdAt)}</p>
                    </div>
                    <span className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-full ${
                      alert.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                      alert.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {/* Mode Toggle + Modules Section */}
      <FadeIn delay={0.2}>
        <div className="mb-8">
          {/* Section header with mode toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary" />
                {t('dashboard.platformModules')}
              </h2>
              {mounted && isSimpleMode && (
                <p className="text-sm text-muted-foreground mt-1">
                  {t('dashboard.simpleModeDesc')}
                </p>
              )}
            </div>
            {mounted && (
              <button
                onClick={toggleMode}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border bg-white dark:bg-slate-800 hover:shadow-md"
              >
                {isSimpleMode ? (
                  <>
                    <Eye className="w-4 h-4 text-primary" />
                    <span>{t('dashboard.fullMode')}</span>
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                      +{hiddenCount}
                    </span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                    <span>{t('dashboard.simpleMode')}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Module Categories */}
          <div className="space-y-6">
            {categoriesToShow.map((catId) => {
              const catModules = grouped.get(catId) || [];
              if (catModules.length === 0) return null;

              const meta = CATEGORY_META[catId];
              const CatIcon = meta.icon;
              const isExpanded = expandedCategories.has(catId);
              const isEssentials = catId === 'essentials';

              return (
                <div key={catId} className="rounded-2xl overflow-hidden">
                  {/* Category Header */}
                  {isEssentials ? (
                    <GradientSection variant="primary" className="rounded-2xl p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-white/20">
                          <CatIcon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white">
                            {t(`dashboard.category.${catId}` as TranslationKey)}
                          </h3>
                          <p className="text-sm text-white/70">
                            {t(`dashboard.category.${catId}.desc` as TranslationKey)}
                          </p>
                        </div>
                      </div>

                      <Stagger staggerDelay={0.04}>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 mt-4">
                          {catModules.map((mod) => {
                            const Icon = iconMap[mod.iconName];
                            return (
                              <StaggerItem key={mod.id}>
                                <Link href={mod.href}>
                                  <Card
                                    variant="interactive"
                                    className={`h-32 sm:h-36 ${mod.color} overflow-hidden group transition-all hover:shadow-lg`}
                                  >
                                    <div className="flex h-full flex-col items-center justify-center text-center p-4">
                                      <div className="p-2.5 rounded-xl bg-white/50 mb-2.5 group-hover:bg-white/80 transition-colors">
                                        <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${mod.accentColor}`} />
                                      </div>
                                      <h4 className="font-semibold text-sm text-slate-900">{t(`module.${mod.id}.title` as TranslationKey)}</h4>
                                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{t(`module.${mod.id}.desc` as TranslationKey)}</p>
                                    </div>
                                  </Card>
                                </Link>
                              </StaggerItem>
                            );
                          })}
                        </div>
                      </Stagger>
                    </GradientSection>
                  ) : (
                    <div className="border rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
                      {/* Clickable Category Header */}
                      <button
                        onClick={() => toggleCategory(catId)}
                        className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-t-2xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${meta.gradient} text-white`}>
                            <CatIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-base sm:text-lg font-semibold text-foreground">
                              {t(`dashboard.category.${catId}` as TranslationKey)}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {t(`dashboard.category.${catId}.desc` as TranslationKey)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                            {catModules.length}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-muted-foreground transition-transform" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Module Grid */}
                      {isExpanded && (
                        <div className="px-4 sm:px-5 pb-5">
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {catModules.map((mod) => {
                              const Icon = iconMap[mod.iconName];
                              return (
                                <Link key={mod.id} href={mod.href}>
                                  <Card
                                    variant="interactive"
                                    className={`h-28 sm:h-32 ${mod.color} overflow-hidden group transition-all hover:shadow-md`}
                                  >
                                    <div className="flex h-full flex-col items-center justify-center text-center p-3">
                                      <div className="p-2 rounded-xl bg-white/50 mb-2 group-hover:bg-white/80 transition-colors">
                                        <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${mod.accentColor}`} />
                                      </div>
                                      <h4 className="font-semibold text-xs sm:text-sm text-slate-900">{t(`module.${mod.id}.title` as TranslationKey)}</h4>
                                      <p className="text-[10px] sm:text-xs text-slate-600 mt-0.5 line-clamp-1 hidden sm:block">{t(`module.${mod.id}.desc` as TranslationKey)}</p>
                                    </div>
                                  </Card>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Show More CTA in simple mode */}
          {mounted && isSimpleMode && hiddenCount > 0 && (
            <button
              onClick={toggleMode}
              className="w-full mt-6 py-4 px-6 rounded-2xl border-2 border-dashed border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 transition-all flex items-center justify-center gap-3 group"
            >
              <div className="flex items-center gap-2 text-primary font-medium">
                <Eye className="w-5 h-5" />
                <span>{t('dashboard.showMore')}</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/15 text-xs font-semibold">
                  +{hiddenCount}
                </span>
              </div>
            </button>
          )}
        </div>
      </FadeIn>
    </>
  );
}
