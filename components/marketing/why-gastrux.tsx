'use client';

import { Check, Brain, BarChart3, Shield } from 'lucide-react';

// Only what Gastrux itself does and the plan it comes in (lib/tier-guard.ts). No claims about named
// competitors: nothing here could be sourced and kept current (site claims review, 2026-09-25).
type FeatureRow = { feature: string; plan: string };

const FEATURES: FeatureRow[] = [
  { feature: 'Custo (CMV) e margem de contribuição por prato', plan: 'Todos' },
  { feature: 'Estoque com alertas de baixa quantidade', plan: 'Todos' },
  { feature: 'Engenharia de cardápio', plan: 'Todos' },
  { feature: '100% na nuvem, sem instalar', plan: 'Todos' },
  { feature: 'Comanda e venda de balcão sem internet', plan: 'Todos' },
  { feature: 'Previsão de demanda', plan: 'Pro ou superior' },
  { feature: 'Kitchen Display System (KDS)', plan: 'Business ou superior' },
  { feature: 'Cardápio digital com QR Code', plan: 'Business ou superior' },
  { feature: 'CRM e programa de fidelidade', plan: 'Business ou superior' },
  { feature: 'Multi-loja', plan: 'Business (2 lojas) ou Enterprise' },
  { feature: 'NFC-e (com certificado e dados do contador)', plan: 'Business ou superior' },
  { feature: 'Recebimento de pedidos externos por webhook (API)', plan: 'Pro ou superior' },
];

const DIFFERENTIALS = [
  {
    icon: BarChart3,
    title: 'Custo de cada prato',
    description: 'O caderno não calcula CMV. A Gastrux calcula o custo de cada prato pela ficha técnica e mostra a margem de contribuição de cada um.',
  },
  {
    icon: Brain,
    title: 'Alertas e previsão',
    description: 'Alerta de estoque baixo, previsão de vendas a partir do seu histórico e lista de compras. Decisão com dados, não no achismo.',
  },
  {
    icon: Shield,
    title: 'Tudo num lugar só',
    description: 'Estoque, vendas, custo, caixa e clientes — tudo junto. Sem precisar de 5 caderninhos diferentes.',
  },
];

export function WhyGastrux() {
  return (
    <section id="por-que-gastrux" className="py-20 px-4 sm:px-6 bg-white dark:bg-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold tracking-wide uppercase mb-3">
            O que a Gastrux faz
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Por que a Gastrux e não o caderno?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Se você já pensou em usar um sistema mas achou complicado ou caro demais, veja o que ela faz e em qual plano.
          </p>
        </div>

        {/* Differentials Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {DIFFERENTIALS.map((d, i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className="w-11 h-11 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <d.icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{d.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{d.description}</p>
            </div>
          ))}
        </div>

        {/* Feature list by plan */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Funcionalidades e planos</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              O detalhe de limites e preços está na <a href="/pricing" className="underline hover:text-blue-600">página de planos</a>.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400 min-w-[220px]">Funcionalidade</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400 min-w-[160px]">Disponível em</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((row) => (
                  <tr key={row.feature} className="border-b border-slate-100 dark:border-slate-700/50">
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-200 font-medium">
                      <Check className="inline w-4 h-4 mr-2 text-emerald-500" aria-hidden />
                      {row.feature}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{row.plan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
