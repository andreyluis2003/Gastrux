# Roteiro da homologação do iFood (Pedidos e Eventos)

Para o dono da conta de desenvolvedor da Help Flow no iFood. Só o dono da conta pode pedir a homologação, e o iFood
aceita uma tentativa a cada 4 horas. Cada etapa aceita até cinco prints.

## Antes de começar

O iFood só libera as credenciais do app de produção **depois** da homologação, e os testes rodam com as credenciais de
teste (conferido em 01/11/2026, na página "Critérios de homologação"). O app de produção **Gastrux** (distribuído, PDV,
não listado) já existe. O aviso "abra um ticket" na página dele não vale para Pedidos e Eventos: esses dois usam o fluxo
automático de Homologação > Nova homologação.

1. **Credenciais de teste no homolog:** copie as do app "HELP FLOW LTDA - Teste (C)" para as variáveis do serviço
   `homolog` no Easypanel:
   - `IFOOD_CLIENT_ID` e `IFOOD_CLIENT_SECRET`;
   - `IFOOD_APP_MODE=centralized`;
   - `IFOOD_POLLING=on`.

   Depois, Deploy do homolog. Não coloque nada disso no `app` (produção) nesta fase.
2. **Ligar a loja de teste:** no modo de teste quem liga é a equipe Gastrux, pela rota
   `POST /api/admin/platform/ifood-link` com `restaurantId` e `merchantId` (o Merchant UUID da loja em Pedidos de teste).
3. **Conferir:** a tela do iFood no homolog deve mostrar **Conectada**, e a loja de teste deve aparecer aberta no iFood.

Depois da aprovação e da análise do iFood: as credenciais do app Gastrux vão para o serviço `app`, com
`IFOOD_APP_MODE=distributed` e `IFOOD_POLLING=on`, e as de teste saem do homolog.

## Pedir a homologação

No Portal do Desenvolvedor: **Homologação > Nova homologação**.

- **App:** escolha o app de produção (PDV).
- **Módulos:** **Pedidos** e **Eventos**.
- **Loja:** a loja de teste.
- **Recebimento dos eventos:** **Polling**.

## As cinco etapas (e os prints)

1. **Conexão:** clique em "Testar conexão".
   - Print: a tela do iFood no Gastrux com "Conectada".
2. **Receber e confirmar pedidos:** faça os pedidos de teste que o iFood pedir.
   - Eles aparecem em **Vender > Pedidos de delivery** com "iFood #número", e o Gastrux confirma sozinho (ou pelo "Aceitar").
   - Prints: a lista de pedidos e a comanda da cozinha, que mostra bandeira, troco, cupons, código de retirada e CPF/CNPJ.
3. **Cancelamento:** no pedido indicado pelo iFood, em Pedidos de delivery, abra o pedido, clique em **Cancelar Pedido**, escolha o
   motivo da lista do iFood e confirme em **Cancelar no iFood**.
   - Print: a lista de motivos e o pedido cancelado.
4. **Despacho:** marque o pedido de entrega própria como **Em preparo**, depois **Pronto**, depois **Concluído** na
   cozinha. O Gastrux manda "pronto" e depois "despachado".
   - Print: o pedido no Gastrux e o status no iFood.
5. **Conclusão:** conclua o pedido indicado.
   - Print: o pedido como "Entregue" em Pedidos de delivery.

## Se for reprovada

- **Relatório:** o iFood manda um relatório com os pontos que falharam. Me passe o relatório (sem credenciais) e eu corrijo.
- **Nova tentativa:** depois de 4 horas.
