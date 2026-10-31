import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Gastrux',
  description: 'Política de privacidade e proteção de dados (LGPD) da plataforma Gastrux.',
};

export default function PrivacidadePage() {
  const dataAtualizacao = '31 de outubro de 2026';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <div className="bg-white rounded-xl shadow-sm border p-6 sm:p-10 space-y-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Política de Privacidade</h1>
            <p className="text-sm text-gray-500 mt-1">Última atualização: {dataAtualizacao}</p>
            <p className="text-sm text-gray-500">Em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">1. Controlador dos Dados</h2>
            <p className="text-gray-700 leading-relaxed">A plataforma Gastrux (&ldquo;nós&rdquo;) é a controladora dos dados pessoais coletados através da Plataforma, nos termos da LGPD.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">2. Dados Coletados</h2>
            <p className="text-gray-700 leading-relaxed">Coletamos os seguintes dados pessoais:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li><strong>Dados de cadastro:</strong> nome, e-mail, senha (criptografada), telefone</li>
              <li><strong>WhatsApp informado no cadastro:</strong> usado para falar com você sobre a sua conta. Dicas e novidades do Gastrux por WhatsApp, que são mensagens de marketing, só com o seu aceite separado no cadastro; você pode parar quando quiser respondendo SAIR.</li>
              <li><strong>Dados do restaurante:</strong> nome, CNPJ, endereço, telefone, horário de funcionamento</li>
              <li><strong>Dados de uso:</strong> registros de acesso, ações realizadas, preferências</li>
              <li><strong>Dados de pagamento:</strong> processados pelo Stripe (não armazenamos dados de cartão)</li>
              <li><strong>Dados de clientes do restaurante:</strong> nome, telefone, e-mail, histórico de pedidos (inseridos por você)</li>
              <li><strong>Cookies e tecnologias similares:</strong> para analytics (Google Analytics 4), medição de anúncios (Pixel da Meta) e funcionamento da sessão</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">3. Finalidade do Tratamento</h2>
            <p className="text-gray-700 leading-relaxed">Utilizamos seus dados para:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Fornecer e manter os serviços da Plataforma</li>
              <li>Autenticar e proteger sua conta</li>
              <li>Processar pagamentos e gerenciar assinaturas</li>
              <li>Enviar comunicações sobre o serviço (atualizações, alertas, onboarding)</li>
              <li>Melhorar a experiência do usuário e desenvolver novos recursos</li>
              <li>Cumprir obrigações legais e regulatórias</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">4. Base Legal (Art. 7º LGPD)</h2>
            <p className="text-gray-700 leading-relaxed">O tratamento dos dados é baseado em:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li><strong>Execução de contrato:</strong> para prestar os serviços contratados</li>
              <li><strong>Consentimento:</strong> para comunicações de marketing e analytics</li>
              <li><strong>Legítimo interesse:</strong> para melhorias do serviço e segurança</li>
              <li><strong>Obrigação legal:</strong> para cumprimento de normas fiscais e regulatórias</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">5. Compartilhamento de Dados</h2>
            <p className="text-gray-700 leading-relaxed">Seus dados podem ser compartilhados com:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li><strong>Processadores de pagamento:</strong> Stripe, para gestão de assinaturas</li>
              <li><strong>Serviços de infraestrutura:</strong> para hospedagem e operação da Plataforma</li>
              <li><strong>Integrações ativadas por você:</strong> iFood, Rappi, Uber Eats, WhatsApp Business, Twilio (somente quando configurados)</li>
              <li><strong>Meta (Facebook e Instagram):</strong> somente se você aceitar os cookies, o Pixel da Meta registra as visitas às páginas públicas do site e a criação de conta, para medir nossos anúncios. Ele não roda nas telas do sistema nem nos cardápios e pedidos dos clientes do restaurante</li>
              <li><strong>Autoridades:</strong> quando exigido por lei ou ordem judicial</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">Não vendemos seus dados. Fora o Pixel da Meta descrito acima, que depende do seu consentimento, não compartilhamos seus dados com terceiros para fins de marketing.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">6. Seus Direitos (Art. 18 LGPD)</h2>
            <p className="text-gray-700 leading-relaxed">Você tem os seguintes direitos:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1">
              <li>Confirmar a existência do tratamento de dados</li>
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
              <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Solicitar a portabilidade dos dados</li>
              <li>Revogar o consentimento a qualquer momento</li>
              <li>Solicitar a eliminação de dados tratados com base no consentimento</li>
            </ul>
            <p className="text-gray-700 leading-relaxed">Para exercer seus direitos, entre em contato pelo canal de suporte da Plataforma ou pelo e-mail disponível nas configurações.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">7. Armazenamento e Segurança</h2>
            <p className="text-gray-700 leading-relaxed">Seus dados são armazenados em servidores seguros com criptografia em trânsito (TLS/SSL) e em repouso. Senhas são armazenadas com hash bcrypt. Implementamos medidas técnicas e organizacionais para proteger seus dados contra acesso não autorizado, perda ou destruição.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">8. Retenção de Dados</h2>
            <p className="text-gray-700 leading-relaxed">Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para prestar os serviços. Após o encerramento da conta, os dados são mantidos por 30 dias para possibilitar a recuperação, e depois são eliminados. Dados necessários para obrigações legais podem ser retidos por período superior.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">9. Cookies</h2>
            <p className="text-gray-700 leading-relaxed">Utilizamos cookies essenciais para o funcionamento da sessão de autenticação e cookies de analytics (Google Analytics 4) para compreender o uso da Plataforma. Nas páginas públicas do site, também usamos o Pixel da Meta para medir nossos anúncios no Facebook e no Instagram. Os cookies de analytics e da Meta só são ativados se você aceitar no aviso de cookies; você pode mudar a escolha a qualquer momento pelo link &quot;Preferências de cookies&quot; no rodapé ou nas configurações do seu navegador.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">10. Transferência Internacional</h2>
            <p className="text-gray-700 leading-relaxed">Alguns de nossos prestadores de serviço podem estar localizados fora do Brasil. Nesses casos, garantimos que a transferência internacional de dados ocorra em conformidade com a LGPD, mediante cláusulas contratuais adequadas ou outras salvaguardas previstas em lei.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">11. Alterações nesta Política</h2>
            <p className="text-gray-700 leading-relaxed">Esta Política pode ser atualizada periodicamente. Alterações significativas serão comunicadas por e-mail ou notificação na Plataforma.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-800">12. Contato e Encarregado (DPO)</h2>
            <p className="text-gray-700 leading-relaxed">Para questões relacionadas à privacidade e proteção de dados, entre em contato através do canal de suporte da Plataforma.</p>
          </section>

          <div className="pt-4 border-t">
            <p className="text-sm text-gray-500">Veja também nossos <Link href="/termos" className="text-primary hover:underline">Termos de Uso</Link>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
