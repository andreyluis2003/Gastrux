'use client';

import { Package, BarChart3, ChefHat, Monitor, Building2, CreditCard, Boxes, Truck, Users, Bell, Calendar, TrendingUp } from 'lucide-react';

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
    icon: Boxes,
    title: 'Lista de compra inteligente',
    description: 'A Gastrux vê o que está acabando e sugere o que comprar. Você só confere e vai pro fornecedor.',
    color: 'bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-400',
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
  {
    icon: TrendingUp,
    title: 'Previsão de vendas',
    description: 'O sistema aprende seu histórico e avisa quantos pratos você vai vender amanhã. Compre só o necessário.',
    color: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400',
  },
  {
    icon: Users,
    title: 'Conheça seus clientes',
    description: 'Cadastro de clientes, programa de fidelidade e campanhas pra trazer quem sumiu de volta.',
    color: 'bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-400',
  },
  {
    icon: CreditCard,
    title: 'Caixa organizado',
    description: 'Recebimentos, pagamentos e fechamento diário em um lugar só. Sem retrabalho, sem erro.',
    color: 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400',
  },
  {
    icon: Building2,
    title: 'Multi-loja',
    description: 'Tem mais de uma unidade? Compare performance e controle tudo de um painel só.',
    color: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400',
  },
  {
    icon: Calendar,
    title: 'Planejamento de produção',
    description: 'Saiba o que preparar por dia, calcule insumos e evite sobras que viram prejuízo.',
    color: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400',
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
