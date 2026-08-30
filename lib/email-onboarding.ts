// @ts-nocheck
export function buildDay3OnboardingEmail(userName: string | null | undefined): string {
  const name = userName?.split(' ')[0] || 'Restaurante';

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Primeiros passos no Gastrux</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 30px; }
        .step { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; border-radius: 4px; }
        .step h3 { margin: 0 0 10px 0; color: #1e40af; }
        .step p { margin: 0; color: #1e3a8a; font-size: 14px; }
        .action-button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        .action-button:hover { background: #2563eb; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>😋 Bem-vindo, ${name}!</h1>
          <p>Seus primeiros passos no Gastrux</p>
        </div>
        
        <div class="content">
          <p>Olá ${name},</p>
          <p>Já faz 3 dias que você se cadastrou no Gastrux! Queremos garantir que está aproveitando ao máximo a plataforma.</p>

          <p style="font-weight: 600; margin-top: 25px;">Aqui estão os próximos passos:</p>

          <div class="step">
            <h3>1️⃣ Configure seu POS</h3>
            <p>Adicione seus métodos de pagamento e inicie a venda. É rápido e simples!</p>
          </div>

          <div class="step">
            <h3>2️⃣ Cadastre seus insumos</h3>
            <p>Adicione os ingredientes que você usa. Isso permite rastreamento de estoque e cálculos de custo.</p>
          </div>

          <div class="step">
            <h3>3️⃣ Crie suas receitas</h3>
            <p>Registre as receitas com custo calculado automaticamente. Perfeito para precificação e rentabilidade.</p>
          </div>

          <p style="color: #6b7280; font-size: 13px; margin-top: 25px;">
            <strong>💲 Dica de ouro:</strong> Com esses 3 passos, você terá acesso total ao dashboard com analytics de OMais alguma dúvida? Temos vídeos tutoriais e documentação completa!
          </p>

          <a href="${process.env.NEXTAUTH_URL}/dashboard" class="action-button">
            Continuar Setup
          </a>
        </div>

        <div class="footer">
          <p>Este é um email de acompanhamento automático do Gastrux.</p>
          <p>Não quer mais receber? Desabilite essa notificação nas configurações.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function buildDay7OnboardingEmail(userName: string | null | undefined): string {
  const name = userName?.split(' ')[0] || 'Restaurante';

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Recursos Premium aguardando</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 30px; }
        .feature { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .feature h3 { margin: 0 0 8px 0; color: #b45309; }
        .feature p { margin: 0; color: #92400e; font-size: 14px; }
        .pricing-box { background: #fef3c7; border: 2px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 20px 0; text-align: center; }
        .pricing-box h2 { margin: 0 0 10px 0; color: #b45309; }
        .pricing-box .price { font-size: 32px; font-weight: bold; color: #d97706; }
        .pricing-box .period { color: #92400e; }
        .action-button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 20px; }
        .action-button:hover { background: #d97706; }
        .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚀 Tá vendo que é bom?</h1>
          <p>Desbloqueie todo o potencial do Gastrux</p>
        </div>
        
        <div class="content">
          <p>Oi ${name},</p>
          <p>Você já está no Gastrux há uma semana! Vimos que você criou alguns insumos e está usando o app regularmente.</p>

          <p style="font-weight: 600; margin-top: 20px; color: #b45309;">Agora que você viu como é fácil usar a plataforma, aqui estão os recursos Premium que vão turbinar seu negócio:</p>

          <div class="feature">
            <h3>📈 Analytics Avançada</h3>
            <p>Relatórios detalhados, tendências de venda, previsões de demanda com IA e mais!</p>
          </div>

          <div class="feature">
            <h3>🔍 Rastreamento de Desperdício</h3>
            <p>Identifique onde o dinheiro está se perdendo e tome ações corretivas imediatas.</p>
          </div>

          <div class="feature">
            <h3>⚙️ Integrações API</h3>
            <p>Conecte com seu fornecedor, sistema de delivery, chatbot e muito mais.</p>
          </div>

          <div class="feature">
            <h3>👥 Múltiplos Usuários</h3>
            <p>Adicione sua equipe com controle de permissões granulares.</p>
          </div>

          <div class="pricing-box">
            <h2>Plano Profissional</h2>
            <div class="price">R$ 99</div>
            <div class="period">/mês (1º mês com 50% OFF)</div>
            <p style="margin-top: 10px; color: #92400e; font-size: 13px;">Cancele quando quiser, sem penalidades!</p>
          </div>

          <a href="${process.env.NEXTAUTH_URL}/pricing" class="action-button">
            Ver Planos e Upgrade
          </a>

          <p style="color: #6b7280; font-size: 13px; margin-top: 25px; text-align: center;">
            <strong>💡 Offer Válida Por:</strong> Esta promocação é válida apenas para os próximos 7 dias!
          </p>
        </div>

        <div class="footer">
          <p>Este é um email de acompanhamento automático do Gastrux.</p>
          <p>Não quer mais receber? Desabilite essa notificação nas configurações.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
