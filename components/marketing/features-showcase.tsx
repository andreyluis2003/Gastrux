'use client';

import { Package, BarChart3, ChefHat, Monitor, Bell, Truck } from 'lucide-react';

const features = [
  {
    icon: BarChart3,
    title: 'Seu lucro real, todo dia',
    description: 'Chega de descobrir no fim do mês que não sobrou nada. Veja quanto lucra por prato, por dia.',
    color: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400',
  },
  {
    icon: ChefHat,
    title: 'Custo de cada prato calculado',
    description: 'Coloca os ingredientes e a quantidade — a Gastrux calcula o custo sozinha. Sem calculadora, sem planilha.',
    color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  },
  {
    icon: Package,
    title: 'Estoque no automático',
    description: 'Vendeu um prato? O estoque já desconta os ingredientes. Avisa quando vai faltar algo.',
    color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  },
  {
    icon: Bell,
    title: 'Alertas no celular',
    description: 'Estoque baixo, custo subiu demais, margem caiu. Você recebe o alerta antes do problema virar prejuízo.',
    color: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400',
  },
  {
    icon: Truck,
    title: 'Delivery integrado',
    description: 'Pedidos do iFood e Rappi entram direto no sistema. Sem digitar de novo, sem erro.',
    color: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400',
  },
  {
    icon: Monitor,
    title: 'Tela da cozinha (KDS)',
    description: 'Os pedidos aparecem na tela da cozinha na ordem certa. Zero papel, zero confusão.',
    color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
  },
];

export function FeaturesShowcase() {
  return (
    <section id="features" className="py-20 px-4 sm:px-6 bg-white dark:bg-slate-900">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold tracking-wide uppercase mb-3">
            Tudo que você precisa
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            Tudo que o caderno não faz por você
          </h2>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            No caderno você anota, mas não calcula, não avisa e não mostra onde está o problema. A Gastrux faz tudo isso — no celular.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="group p-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className={`w-12 h-12 rounded-lg ${f.color} flex items-center justify-center mb-4`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
