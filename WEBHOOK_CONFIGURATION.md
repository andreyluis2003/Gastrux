# Configuração de Webhooks — Mercado Pago & Stripe

Este documento descreve como configurar os webhooks necessários para o funcionamento correto
do módulo de pagamentos da plataforma Restaurantes.

---

## 1. Mercado Pago

### 1.1 URL do Webhook (produção)

```
https://restaurantes-cl3480.abacusai.app/api/pagamentos/mp/webhook
```

> Caso o deploy esteja em domínio próprio, substitua o host acima pelo domínio de produção.

### 1.2 Tópicos (Events) a habilitar

| Tópico             | Descrição                                                  |
|--------------------|-------------------------------------------------------------|
| `payment`          | Atualizações de status de pagamentos (PIX, cartão etc.)    |
| `merchant_order`   | Atualizações de ordens do checkout transparente            |
| `preapproval`      | Atualizações de assinaturas recorrentes                    |
| `chargebacks`      | Notificações de chargeback                                 |
| `refunds`          | Notificações de reembolso                                  |

### 1.3 Passo-a-passo no painel do Mercado Pago

1. Acesse `https://www.mercadopago.com.br/developers/panel/app` e selecione sua aplicação.
2. No menu lateral clique em **Webhooks** → **Configurar notificações**.
3. Em **Modo**, selecione **Produção**.
4. Cole a URL do Webhook descrita acima.
5. Marque os tópicos (`payment`, `merchant_order`, `preapproval`, `chargebacks`, `refunds`).
6. Clique em **Gerar chave secreta** e copie o valor exibido.
7. No arquivo `.env` do projeto defina:
    ```env
    MERCADO_PAGO_ENV=production
    MERCADO_PAGO_ACCESS_TOKEN_PROD=APP-USR-...
    NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY_PROD=APP-USR-...
    MERCADO_PAGO_WEBHOOK_SECRET=<chave-secreta-do-webhook>
    ```
8. Faça o deploy para aplicar as novas credenciais.
9. Clique em **Testar notificação** no painel do MP para confirmar integração.

### 1.4 Validação de assinatura (implementada)

O handler `/api/pagamentos/mp/webhook` valida o header `x-signature` com HMAC-SHA256
usando `MERCADO_PAGO_WEBHOOK_SECRET`. Em produção, requisições sem assinatura
válida são rejeitadas com **401 Unauthorized**.

---

## 2. Stripe

### 2.1 URL do Webhook (produção)

```
https://restaurantes-cl3480.abacusai.app/api/pagamentos/stripe/webhook
```

### 2.2 Eventos a habilitar

| Evento Stripe                             | Descrição                                  |
|-------------------------------------------|--------------------------------------------|
| `payment_intent.succeeded`                | Pagamento confirmado                       |
| `payment_intent.payment_failed`           | Falha em pagamento                         |
| `charge.refunded`                         | Reembolso processado                       |
| `charge.dispute.created`                  | Disputa/chargeback aberta                  |
| `charge.dispute.closed`                   | Disputa encerrada                          |
| `customer.subscription.created`           | Assinatura criada                          |
| `customer.subscription.updated`           | Assinatura atualizada                      |
| `customer.subscription.deleted`           | Assinatura cancelada                       |
| `invoice.payment_succeeded`               | Invoice paga                               |
| `invoice.payment_failed`                  | Falha no pagamento de invoice              |
| `account.updated`                         | Atualização de conta (Stripe Connect)      |
| `account.application.deauthorized`        | Conta desconectada (Stripe Connect)        |

### 2.3 Passo-a-passo no painel Stripe

1. Acesse `https://dashboard.stripe.com/webhooks`.
2. Certifique-se de estar em modo **Live** (canto superior direito).
3. Clique em **Add endpoint**.
4. Cole a URL do Webhook descrita acima.
5. Em **Select events**, adicione os eventos da tabela 2.2.
6. Em **Endpoint for**, selecione:
   - *Your account* para pagamentos diretos
   - *Connected accounts* caso utilize Stripe Connect
   (Recomendação: adicione **dois endpoints**, um para cada modo.)
7. Salve o endpoint.
8. Clique em **Reveal signing secret** e copie o valor.
9. No `.env` do projeto, defina:
    ```env
    STRIPE_SECRET_KEY=sk_live_...
    STRIPE_PUBLISHABLE_KEY=pk_live_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    ```
10. Faça o deploy e rode um "Send test webhook" pelo painel para validar.

### 2.4 Validação de assinatura

O handler `/api/pagamentos/stripe/webhook` já valida `stripe-signature` via
`stripe.webhooks.constructEvent()`. Requisições com assinatura inválida são
rejeitadas com **400 Bad Request**.

---

## 3. Variáveis de ambiente — resumo

| Variável                                        | Obrigatória | Descrição                                    |
|-------------------------------------------------|-------------|----------------------------------------------|
| `MERCADO_PAGO_ENV`                              | Sim         | `test` ou `production` (default: `test`)    |
| `MERCADO_PAGO_ACCESS_TOKEN`                     | Sim (test)  | Access token de teste                        |
| `MERCADO_PAGO_ACCESS_TOKEN_PROD`                | Sim (prod)  | Access token de produção (`APP-USR-...`)     |
| `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY`           | Sim (test)  | Public key de teste                          |
| `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY_PROD`      | Sim (prod)  | Public key de produção                       |
| `MERCADO_PAGO_WEBHOOK_SECRET`                   | Sim (prod)  | Chave secreta do webhook MP                  |
| `STRIPE_SECRET_KEY`                             | Sim         | `sk_live_...` ou `sk_test_...`               |
| `STRIPE_PUBLISHABLE_KEY`                        | Sim         | `pk_live_...` ou `pk_test_...`               |
| `STRIPE_WEBHOOK_SECRET`                         | Sim         | `whsec_...` do endpoint principal            |

---

## 4. Checklist de Go-Live

- [ ] Trocar `MERCADO_PAGO_ENV=test` para `production` no `.env`
- [ ] Preencher `MERCADO_PAGO_ACCESS_TOKEN_PROD` e `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY_PROD`
- [ ] Configurar webhook MP no painel e copiar `MERCADO_PAGO_WEBHOOK_SECRET`
- [ ] Trocar chaves Stripe (`sk_live_...`) se ainda estiverem em test mode
- [ ] Configurar dois endpoints de webhook Stripe (direct + connect)
- [ ] Deploy da aplicação
- [ ] Emitir pagamentos de smoke-test (R$ 0,50 em PIX e cartão)
- [ ] Validar entrega dos webhooks em `/dashboard/pagamentos/conciliacao`
- [ ] Validar geração automática de alertas em `/dashboard/pagamentos/alertas`

