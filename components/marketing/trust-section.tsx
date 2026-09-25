import Link from 'next/link';
import { Building2, ClipboardList, BookOpen, Users, Receipt, ArrowRight } from 'lucide-react';

/**
 * Replaces the testimonials carousel. Gastrux is launching and has no customer results it can prove
 * yet, so trust comes from what can be checked: how implementation works and who is behind the
 * product (site claims review, 2026-09-25).
 */
const STEPS = [
  {
    icon: ClipboardList,
    title: '1. Insumos e preços',
    description: 'Você cadastra os ingredientes com o preço que paga ao fornecedor. Dá pra começar pelos 20 que mais pesam.',
  },
  {
    icon: BookOpen,
    title: '2. Fichas técnicas',
    description: 'Monte a receita de cada prato com as quantidades. A partir daí o custo (CMV) e a margem aparecem sozinhos.',
  },
  {
    icon: Users,
    title: '3. Equipe e permissões',
    description: 'Convide garçom, caixa e cozinha. Cada um vê só o que precisa, e as ações ficam registradas.',
  },
  {
    icon: Receipt,
    title: '4. Fiscal (opcional)',
    description: 'Para emitir NFC-e, seu contador preenche a tributação dos produtos e você envia o certificado digital.',
  },
];

export function TrustSection() {
  return (
    <section id="como-comecar" className="py-20 px-4 sm:px-6 bg-slate-50 dark:bg-slate-800/40">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold tracking-wide uppercase mb-3">
            Como é a implantação
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Do caderno ao sistema, em quatro passos
          </h2>
          <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
            A Gastrux está em lançamento. Em vez de números de clientes, mostramos o caminho: o que você faz em cada
            etapa e o que o sistema calcula a partir disso.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-14">
          {STEPS.map((s) => (
            <div key={s.title} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
              <div className="w-11 h-11 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <s.icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{s.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 md:items-center">
          <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Quem está por trás</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              A Gastrux é desenvolvida pela Help Flow Ltda, empresa brasileira (CNPJ 61.639.918/0001-70). Antes de
              assinar, você pode criar a conta grátis e testar com os seus próprios pratos; de dentro do sistema, a equipe atende pelo suporte.
            </p>
          </div>
          <Link
            href="/auth/signup"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ArrowRight className="w-4 h-4" />
            Criar conta grátis
          </Link>
        </div>
      </div>
    </section>
  );
}
