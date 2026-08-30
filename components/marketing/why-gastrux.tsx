'use client';

import { Check, X, Zap, Brain, BarChart3, Smartphone, CreditCard, Shield } from 'lucide-react';

const COMPETITORS = ['Saipos', 'Consumer', 'SisFood', 'GrandChef'];

type FeatureRow = {
  feature: string;
  gastrux: boolean | string;
  competitors: (boolean | string)[];
  highlight?: boolean;
};

const COMPARISON: FeatureRow[] = [
  { feature: 'CMV automático por prato', gastrux: true, competitors: [false, false, false, false], highlight: true },
  { feature: 'Inteligência Artificial integrada', gastrux: true, competitors: [false, false, false, false], highlight: true },
  { feature: 'Previsão de demanda (ML)', gastrux: true, competitors: [false, false, false, false], highlight: true },
  { feature: 'Engenharia de cardápio', gastrux: true, competitors: [false, false, false, false] },
  { feature: '100% na nuvem (sem instalar)', gastrux: true, competitors: [true, false, true, true] },
  { feature: 'Plano grátis para sempre', gastrux: true, competitors: [false, '200 ped/mês', false, false] },
  { feature: 'Multi-loja', gastrux: true, competitors: [true, false, false, false] },
  { feature: 'CRM + Programa de fidelidade', gastrux: true, competitors: [false, false, false, false] },
  { feature: 'WhatsApp Bot + Agente de Voz IA', gastrux: true, competitors: [false, false, false, false], highlight: true },
  { feature: 'Integração iFood, Rappi, Uber', gastrux: true, competitors: [true, true, true, false] },
  { feature: 'Kitchen Display System (KDS)', gastrux: true, competitors: [true, true, false, false] },
  { feature: 'Nota Fiscal Eletrônica (NF-e)', gastrux: true, competitors: [true, true, true, false] },
];

const DIFFERENTIALS = [
  {
    icon: Smartphone,
    title: 'Funciona no celular',
    description: 'Não precisa de computador, nem instalar nada. Abre no celular e já funciona — igual abrir o WhatsApp.',
  },
  {
    icon: BarChart3,
    title: 'Custo real de cada prato',
    description: 'O caderno não calcula CMV. A Gastrux mostra o custo exato de cada prato — e onde você está perdendo margem.',
  },
  {
    icon: CreditCard,
    title: 'Grátis pra começar',
    description: 'Plano Starter sem cartão, sem prazo. Se não gostar, volta pro caderno — sem custo nenhum.',
  },
  {
    icon: Zap,
    title: 'Simples como um caderno',
    description: 'Se você sabe anotar, sabe usar. Interface limpa, sem menus complicados, sem termos técnicos.',
  },
  {
    icon: Brain,
    title: 'Inteligência que o caderno não tem',
    description: 'Previsão de vendas, alertas automáticos e sugestões de compra. Você toma decisão com dados, não no achismo.',
  },
  {
    icon: Shield,
    title: 'Tudo num lugar só',
    description: 'Estoque, vendas, custo, delivery, clientes — tudo junto. Sem precisar de 5 caderninhos diferentes.',
  },
];

function CellValue({ value }: { value: boolean | string }) {
  if (value === true) return <Check className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === false) return <X className="w-5 h-5 text-slate-300 dark:text-slate-600 mx-auto" />;
  return <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{value}</span>;
}

export function WhyGastrux() {
  return (
    <section id="por-que-gastrux" className="py-20 px-4 sm:px-6 bg-white dark:bg-slate-900">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold tracking-wide uppercase mb-3">
            Comparativo honesto
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Por que a Gastrux e não o caderno (ou outro sistema)?
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            Se você já pensou em usar um sistema mas achou complicado ou caro demais — a Gastrux é diferente. Veja por quê.
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

        {/* Comparison Table */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Tabela comparativa</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Funcionalidades que fazem a diferença no dia a dia</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-500 dark:text-slate-400 min-w-[200px]">Funcionalidade</th>
                  <th className="text-center py-3 px-3 font-bold text-blue-600 dark:text-blue-400 min-w-[90px] bg-blue-50/50 dark:bg-blue-900/10">Gastrux</th>
                  {COMPETITORS.map((c) => (
                    <th key={c} className="text-center py-3 px-3 font-medium text-slate-400 dark:text-slate-500 min-w-[80px]">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-slate-100 dark:border-slate-700/50 ${
                      row.highlight ? 'bg-emerald-50/50 dark:bg-emerald-900/5' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-200 font-medium">
                      {row.feature}
                      {row.highlight && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                          Exclusivo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center bg-blue-50/50 dark:bg-blue-900/10">
                      <CellValue value={row.gastrux} />
                    </td>
                    {row.competitors.map((val, j) => (
                      <td key={j} className="py-3 px-3 text-center">
                        <CellValue value={val} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 text-center border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              * Dados baseados em informações públicas dos sites oficiais dos concorrentes (jun/2026)
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
