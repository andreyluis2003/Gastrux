/** Knowledge: plans, trial and AI limits (lib/billing/pricing-tiers.ts, spec 2026-10-18 planos-teste-business). */
export default `## Planos
Minha assinatura: no rodapé do menu lateral, abaixo de "Enviar sugestão" (só o dono).
- Teste grátis: toda conta nova tem 30 dias com tudo do Business, sem cartão. Uma faixa no topo mostra quantos dias faltam, e o sino e o e-mail avisam nos dias 23, 27 e 30.
- Assinar durante o teste: a primeira cobrança só acontece quando os 30 dias acabam; a faixa do teste some e os avisos param.
- Fim do teste sem plano: a conta fica só para consulta (vê tudo, mas não vende, não cadastra e não usa a IA) até o dono escolher um plano. Os pedidos pelo QR Code, site de delivery e WhatsApp também param. Nada é apagado.
- Pro (R$ 149 por mês ou R$ 1.639 por ano): vender, caixa, NFC-e, cardápio com QR Code, estoque, fichas técnicas, CMV, compras, anotações de clientes, etiquetas, contagem do dia, contas de consumo, contas a pagar e API de pedidos; 1.000 vendas por mês, 2 usuários, cozinha (KDS) com 2 estações, 50 perguntas à IA por mês.
- Business (R$ 199 por mês ou R$ 2.189 por ano): tudo do Pro, mais pagamento na mesa pelo celular, controle de validades com aviso, indicadores das contas de consumo, contas a pagar com avisos, repetição automática e boletos da nota de compra, aviso de diferença na contagem do dia, cashback e campanhas, relatórios avançados e até 2 lojas; 3.500 vendas por mês, 5 usuários, 5 estações de cozinha, 350 perguntas à IA por mês.
- Enterprise: sob consulta; vendas, lojas, usuários e estações de cozinha ilimitados.
- Plano anual: 11 meses pelo preço de 12.
- Passar do limite de vendas não bloqueia nenhuma venda; o Gastrux avisa para mudar de plano.
- "Análise detalhada" da IA a partir do Pro. Uso em Configurações > Uso da IA.
- Cancelar: Minha assinatura > Gerenciar assinatura > Cancelar assinatura. O plano segue até o fim do período pago; depois a conta fica só para consulta.
- Indique e ganhe (Minha assinatura > Indique e ganhe, só o dono): link gastrux.com/?ref=CÓDIGO (guardado 60 dias) ou o código no campo "Código de indicação (opcional)" do cadastro. Quem chega pelo link testa 45 dias. Quem indica ganha 1 mês grátis do próprio plano quando o indicado paga a primeira mensalidade e continua assinando 7 dias (situações: Em teste, Pagou: confirmando, Mês ganho, Mês usado, Cancelada). Na assinatura pelo cartão (Stripe) o mês vira crédito descontado da próxima mensalidade; no teste fica guardado e é descontado da próxima mensalidade depois de assinar; no Mercado Pago fica guardado até o desconto automático ser liberado. Até 12 meses por ano; outra loja do mesmo dono e contas internas não contam; cancelamento ou reembolso do indicado em 7 dias cancela a indicação. Não há pagamento em dinheiro nem PIX.`;
