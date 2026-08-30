'use client';

import { PlugZap, Upload, Rocket } from 'lucide-react';

const steps = [
  {
    n: 1,
    icon: PlugZap,
    title: 'Cadastre em 10 minutos',
    description:
      'Sem cartão, sem instalar nada. Coloca o nome do restaurante, os pratos principais e os ingredientes — pronto.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    n: 2,
    icon: Upload,
    title: 'Larga o caderno',
    description:
      'Tudo que você anotava no caderno agora aparece organizado na tela: compras, estoque, custo de cada prato.',
    color: 'from-violet-500 to-fuchsia-500',
  },
  {
    n: 3,
    icon: Rocket,
    title: 'Veja seu lucro de verdade',
    description:
      'Todo dia você sabe: quanto vendeu, quanto gastou, quanto lucrou. No celular, na hora que quiser.',
    color: 'from-emerald-500 to-green-500',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 px-4 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-semibold tracking-wide uppercase mb-3">
            Começar é fácil
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-3">
            Do caderno ao controle total em 3 passos
          </h2>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400">
            Se você sabe anotar num caderno, sabe usar a Gastrux. É tão simples assim.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.n}
                className="relative bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 hover:shadow-xl transition"
              >
                <div
                  className={`w-14 h-14 rounded-xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center mb-5 shadow-lg`}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <div aria-hidden="true" className="absolute top-6 right-6 flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold select-none">
                  {s.n}
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{s.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{s.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
