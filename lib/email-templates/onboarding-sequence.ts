/**
 * Email Onboarding Sequence Templates
 * Day 0 (welcome), Day 1 (quick tips), Day 3 (first steps - existing),
 * Day 7 (next step - existing), Day 14 (advanced), Day 21 (upgrade), Trial Ending.
 */

const BASE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #111827; background: #f9fafb; margin: 0; padding: 20px 0; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); color: white; padding: 36px 30px; text-align: center; }
  .header h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
  .content { padding: 30px; }
  .content p { margin: 0 0 14px 0; font-size: 15px; color: #374151; }
  .step { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 14px 16px; margin: 12px 0; border-radius: 4px; }
  .step h3 { margin: 0 0 6px 0; color: #1e40af; font-size: 15px; }
  .step p { margin: 0; color: #1e3a8a; font-size: 14px; }
  .action { text-align: center; margin: 28px 0 12px 0; }
  .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; }
  .btn-amber { background: #F59E0B; }
  .highlight { background: #fef3c7; border-left: 4px solid #F59E0B; padding: 14px 16px; margin: 16px 0; border-radius: 4px; color: #78350f; }
  .stat { background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 8px 0; }
  .stat .value { font-size: 28px; font-weight: 700; color: #3b82f6; }
  .stat .label { font-size: 13px; color: #6b7280; margin-top: 4px; }
  .footer { background: #f9fafb; padding: 22px 30px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
  .footer a { color: #6b7280; }
`;

function appUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://gastrux.com';
}

function wrap(innerHtml: string, title = 'Gastrux'): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>${title}</title><style>${BASE_STYLES}</style></head>
<body><div class="container">${innerHtml}<div class="footer">Você está recebendo este email porque criou uma conta no Gastrux.<br/><a href="${appUrl()}/configuracoes/notificacoes">Gerenciar preferências de email</a></div></div></body></html>`;
}

export function buildWelcomeEmail(userName?: string | null): { subject: string; html: string } {
  const name = (userName || 'Restaurante').split(' ')[0];
  return {
    subject: '🎉 Bem-vindo ao Gastrux — vamos começar',
    html: wrap(`
      <div class="header">
        <h1>Bem-vindo, ${name}! 👋</h1>
        <p>Seu trial de 14 dias começou — sem cartão, sem compromisso</p>
      </div>
      <div class="content">
        <p>Que bom ter você aqui! O Gastrux ajuda você a controlar seu restaurante do PDV ao estoque, do cardápio ao KDS — tudo em um só lugar.</p>
        <div class="step"><h3>📋 Configure em 5 minutos</h3><p>Adicione seu restaurante, mesas, cardápio e cadastre sua equipe.</p></div>
        <div class="step"><h3>🧾 Abra o PDV</h3><p>Teste uma venda usando nosso simulador de cartão e PIX.</p></div>
        <div class="step"><h3>📊 Veja relatórios</h3><p>Em 24h você terá dados prontos para analisar vendas e custos.</p></div>
        <div class="action"><a href="${appUrl()}/dashboard" class="btn">Acessar Dashboard</a></div>
        <p style="margin-top: 28px; font-size: 13px; color: #6b7280;">Dúvidas? Responda este email ou acesse nossa <a href="${appUrl()}/ajuda">central de ajuda</a>.</p>
      </div>
    `, 'Bem-vindo ao Gastrux'),
  };
}

export function buildDay1Email(userName?: string | null): { subject: string; html: string } {
  const name = (userName || 'Restaurante').split(' ')[0];
  return {
    subject: '⚡ 3 dicas rápidas para seu primeiro dia',
    html: wrap(`
      <div class="header">
        <h1>⚡ 3 atalhos que vão te economizar tempo</h1>
        <p>Use hoje e sinta a diferença já amanhã</p>
      </div>
      <div class="content">
        <p>Olá ${name}! Hoje é seu segundo dia com o Gastrux. Veja 3 dicas rápidas para extrair o máximo da plataforma:</p>
        <div class="step"><h3>1. Cadastre insumos com CSV</h3><p>Importe uma planilha inteira em segundos. Em <strong>Insumos → Importar</strong>.</p></div>
        <div class="step"><h3>2. Use o KDS no tablet</h3><p>Abra <strong>/kds</strong> em um tablet da cozinha. Pedidos aparecem em tempo real.</p></div>
        <div class="step"><h3>3. Convide sua equipe</h3><p>Cada colaborador tem login próprio com permissões — menos confusão, mais controle.</p></div>
        <div class="action"><a href="${appUrl()}/dashboard" class="btn">Explorar agora</a></div>
      </div>
    `, 'Dicas rápidas'),
  };
}

export function buildDay14Email(userName?: string | null): { subject: string; html: string } {
  const name = (userName || 'Restaurante').split(' ')[0];
  return {
    subject: '🚀 Você já está no meio do trial — veja o que é possível',
    html: wrap(`
      <div class="header">
        <h1>2 semanas depois, o que seus colegas estão fazendo?</h1>
        <p>Casos reais para inspirar</p>
      </div>
      <div class="content">
        <p>Olá ${name}, você já tem 14 dias de uso. Restaurantes como o seu tipicamente observam nesta altura:</p>
        <div class="stat"><div class="value">−18%</div><div class="label">de custo médio em insumos com ajuste de CMV</div></div>
        <div class="stat"><div class="value">+23%</div><div class="label">de giro no pico de almoço com KDS</div></div>
        <div class="stat"><div class="value">−2h</div><div class="label">por semana em trabalhos manuais de conferência</div></div>
        <p style="margin-top: 20px;"><strong>Próximos passos sugeridos:</strong></p>
        <div class="step"><h3>🧑‍💼 CRM de clientes</h3><p>Comece a criar fidelização e campanhas de recompra.</p></div>
        <div class="step"><h3>📱 Integração iFood</h3><p>Receba pedidos direto no KDS — sem tablet extra.</p></div>
        <div class="action"><a href="${appUrl()}/analytics" class="btn">Ver meus relatórios</a></div>
      </div>
    `, 'Veja o que é possível'),
  };
}

export function buildDay21Email(userName?: string | null, currentTier = 'starter'): { subject: string; html: string } {
  const name = (userName || 'Restaurante').split(' ')[0];
  const isStarter = currentTier === 'starter';
  return {
    subject: isStarter ? '🎁 Oferta especial: 20% off nos primeiros 3 meses do Pro' : '🎯 Recursos que você ainda pode explorar',
    html: wrap(`
      <div class="header">
        <h1>${isStarter ? 'Hora de destravar o Pro 🚀' : 'Recursos que você pode explorar'}</h1>
        <p>${isStarter ? 'Oferta válida até o fim do mês' : 'Aproveite seu plano ao máximo'}</p>
      </div>
      <div class="content">
        <p>Oi ${name}, você já está com a gente há 3 semanas. Algumas funcionalidades ainda podem turbinar sua operação:</p>
        ${isStarter ? `
          <div class="highlight">
            <strong>🎁 Oferta exclusiva:</strong> 20% de desconto nos primeiros 3 meses do plano Pro. Use o cupom <strong>PROMO20</strong> no checkout.
          </div>
        ` : ''}
        <div class="step"><h3>📊 Relatórios avançados</h3><p>Breakdown de custos por prato, projeção de demanda e alertas inteligentes.</p></div>
        <div class="step"><h3>🌐 Multi-loja</h3><p>Gerencie várias unidades do mesmo painel com acesso centralizado.</p></div>
        <div class="step"><h3>🎯 Metas & KPIs</h3><p>Acompanhe objetivos diários e semanais de faturamento e margem.</p></div>
        <div class="action"><a href="${appUrl()}/precos" class="btn btn-amber">${isStarter ? 'Fazer upgrade agora' : 'Ver planos'}</a></div>
      </div>
    `, 'Oferta especial'),
  };
}

export function buildTrialEndingEmail(userName?: string | null, daysLeft = 3): { subject: string; html: string } {
  const name = (userName || 'Restaurante').split(' ')[0];
  return {
    subject: `⏳ Seu trial termina em ${daysLeft} dias`,
    html: wrap(`
      <div class="header">
        <h1>⏳ Faltam ${daysLeft} dias do seu trial</h1>
        <p>Não perca seus dados e configurações</p>
      </div>
      <div class="content">
        <p>Olá ${name}, seu período de avaliação gratuita termina em <strong>${daysLeft} dias</strong>.</p>
        <p>Para continuar usando o Gastrux com toda a sua operação configurada, adicione um método de pagamento agora:</p>
        <div class="highlight">
          ✅ Seus dados permanecem intactos<br/>
          ✅ Cancele a qualquer momento, sem multa<br/>
          ✅ Suporte prioritário por chat
        </div>
        <div class="action"><a href="${appUrl()}/conta/cobranca" class="btn btn-amber">Escolher plano</a></div>
        <p style="margin-top: 18px; font-size: 13px; color: #6b7280;">Se tiver dúvidas, <a href="${appUrl()}/suporte">abra um ticket de suporte</a> ou responda este email.</p>
      </div>
    `, 'Trial terminando'),
  };
}
