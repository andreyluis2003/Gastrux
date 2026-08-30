'use client';

import { Plus } from 'lucide-react';

type FAQ = { q: string; a: string };

const DEFAULT_FAQS: FAQ[] = [
  {
    q: 'Nunca usei sistema nenhum, só caderno. Vou conseguir usar?',
    a: 'Sim! A Gastrux foi feita pra quem nunca usou sistema. Se você sabe usar WhatsApp, sabe usar a Gastrux. É tudo no celular, com linguagem simples e sem menus complicados.',
  },
  {
    q: 'Preciso pagar algo pra começar?',
    a: 'Não. O plano Starter é gratuito para sempre, sem cartão de crédito. Você só paga se quiser recursos avançados, quando estiver pronto.',
  },
  {
    q: 'Quanto tempo leva pra começar a usar?',
    a: 'Uns 10 minutos. Você cadastra o restaurante, coloca os pratos principais e os ingredientes — e já começa a ver seu custo e lucro.',
  },
  {
    q: 'Funciona no celular? Não tenho computador no restaurante.',
    a: 'Funciona 100% no celular. Aliás, a maioria dos donos usa só pelo celular mesmo. Não precisa instalar nada, é só abrir no navegador.',
  },
  {
    q: 'E se eu não gostar, perco alguma coisa?',
    a: 'Nada. Se não gostar, você volta pro caderno sem custo nenhum. Sem multa, sem contrato, sem pergunta.',
  },
  {
    q: 'Integra com iFood e outros apps de delivery?',
    a: 'Sim. Nos planos pagos, os pedidos do iFood, Rappi e Uber Eats entram automático no sistema — sem você digitar nada.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Ficam. Tudo armazenado em servidores seguros com backup diário. Você pode exportar seus dados a qualquer momento.',
  },
];

export function FAQSection({
  faqs = DEFAULT_FAQS,
  title = 'Perguntas frequentes',
}: {
  faqs?: FAQ[];
  title?: string;
}) {
  return (
    <section className="py-20 px-4 sm:px-6 bg-white dark:bg-slate-900">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold tracking-wide uppercase mb-3">
            Dúvidas comuns
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details
              key={i}
              className="group border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 open:border-blue-300 open:dark:border-blue-700 open:bg-blue-50/50 open:dark:bg-blue-950/20 open:shadow-sm transition-all"
              open={i === 0}
            >
              <summary className="cursor-pointer list-none flex items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-slate-900 dark:text-slate-100">
                <span>{f.q}</span>
                <Plus className="w-5 h-5 text-slate-400 group-open:rotate-45 transition-transform flex-shrink-0" />
              </summary>
              <div className="px-5 pb-5 text-slate-600 dark:text-slate-400 leading-relaxed">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export { DEFAULT_FAQS };
