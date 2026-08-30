import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Termos de Uso — Gastrux',
  description: 'Termos e condições de uso da plataforma Gastrux.',
};

export default function TermosPage() {
  const dataAtualizacao = '28 de abril de 2026';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <div className="bg-white rounded-xl shadow-sm border p-6 sm:p-10 space-y-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Termos de Uso</h1>
            <p className="text-sm text-gray-500 mt-1">Última atualização: {dataAtualizacao}</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">1. Aceitação dos Termos</h2>
            <p className="text-gray-700 leading-relaxed">Ao acessar e utilizar a plataforma Gastrux (&ldquo;Plataforma&rdquo;), você concorda integralmente com estes Termos de Uso. Caso não concorde, não utilize a Plataforma.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">2. Descrição do Serviço</h2>
            <p className="text-gray-700 leading-relaxed">A Plataforma é um sistema de gestão para restaurantes que oferece funcionalidades como controle de estoque, cardápio digital, gestão financeira, CRM, relatórios, e integrações com serviços de terceiros. Os recursos disponíveis variam conforme o plano contratado (Starter, Pro, Business ou Enterprise).</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">3. Cadastro e Conta</h2>
            <p className="text-gray-700 leading-relaxed">Para utilizar a Plataforma, você deve criar uma conta fornecendo informações verdadeiras e completas. Você é responsável por manter a confidencialidade de sua senha e por todas as atividades realizadas em sua conta. Ao se cadastrar, um restaurante é criado automaticamente com período de teste gratuito (trial) de 30 dias.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">4. Planos e Pagamento</h2>
            <p className="text-gray-700 leading-relaxed">A Plataforma oferece planos de assinatura mensal ou anual. Os pagamentos são processados de forma segura via Stripe. A cobrança é recorrente e pode ser cancelada a qualquer momento pelo painel de cobrança. Não há reembolso proporcional para o período já pago.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">5. Uso Aceitável</h2>
            <p className="text-gray-700 leading-relaxed">Você concorda em utilizar a Plataforma apenas para fins lícitos e relacionados à gestão do seu estabelecimento. É proibido: (a) tentar acessar dados de outros usuários; (b) realizar engenharia reversa; (c) utilizar a Plataforma para fins ilegais; (d) sobrecarregar intencionalmente os servidores.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">6. Propriedade Intelectual</h2>
            <p className="text-gray-700 leading-relaxed">Todo o conteúdo da Plataforma, incluindo textos, design, logotipos, código-fonte e funcionalidades, é de propriedade exclusiva da Plataforma Gastrux ou de seus licenciadores. Os dados inseridos por você (receitas, estoque, clientes, etc.) permanecem de sua propriedade.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">7. Disponibilidade e SLA</h2>
            <p className="text-gray-700 leading-relaxed">Nos esforçamos para manter a Plataforma disponível 24/7, mas não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência. Em caso de indisponibilidade prolongada, compensações podem ser avaliadas caso a caso.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">8. Limitação de Responsabilidade</h2>
            <p className="text-gray-700 leading-relaxed">A Plataforma é fornecida &ldquo;como está&rdquo;. Não nos responsabilizamos por perdas financeiras, perda de dados ou danos indiretos decorrentes do uso. Recomendamos manter backups regulares dos seus dados.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">9. Rescisão</h2>
            <p className="text-gray-700 leading-relaxed">Você pode encerrar sua conta a qualquer momento. Reservamo-nos o direito de suspender ou encerrar contas que violem estes Termos. Após o encerramento, seus dados serão mantidos por 30 dias e depois removidos permanentemente.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">10. Alterações nos Termos</h2>
            <p className="text-gray-700 leading-relaxed">Podemos atualizar estes Termos periodicamente. Alterações significativas serão comunicadas por e-mail ou pela Plataforma. O uso continuado após as alterações constitui aceitação dos novos termos.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">11. Foro e Legislação</h2>
            <p className="text-gray-700 leading-relaxed">Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de São Paulo, SP, para dirimir quaisquer controvérsias decorrentes destes Termos.</p>
          </section>

          <div className="pt-4 border-t">
            <p className="text-sm text-gray-500">Veja também nossa <Link href="/privacidade" className="text-blue-600 hover:underline">Política de Privacidade</Link>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
