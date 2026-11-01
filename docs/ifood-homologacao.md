# Roteiro da homologação do iFood (Pedidos e Eventos)

Para o dono da conta de desenvolvedor da Help Flow no iFood. Só o dono da conta pode pedir a homologação, e o iFood
aceita uma tentativa a cada 4 horas. Cada etapa aceita até cinco prints.

## Antes de começar

O iFood só libera as credenciais do app de produção **depois** da homologação, e os testes rodam com as credenciais de
teste (conferido em 01/11/2026, na página "Critérios de homologação"). O app de produção **Gastrux** (distribuído, PDV,
não listado) já existe. O aviso "abra um ticket" na página dele não vale para Pedidos e Eventos: esses dois usam o fluxo
automático de Homologação > Nova homologação.

1. **Credenciais de teste no homolog:** o Testar conexão exige o app **distribuído** de teste (erro de 01/11/2026 com o Teste (C): "Esperado: client containing help-flow-ltda-teste-d"). Copie as do app "HELP FLOW LTDA - Teste (D)" para as variáveis do serviço `homolog` no Easypanel:
   - `IFOOD_CLIENT_ID` e `IFOOD_CLIENT_SECRET`;
   - `IFOOD_APP_MODE=distributed`;
   - `IFOOD_POLLING=on`.

   Depois, Deploy do homolog. Não coloque nada disso no `app` (produção) nesta fase.
2. **Ligar a loja de teste:** em Configurações > iFood, clique em Conectar iFood, digite o código no Portal do Parceiro e cole de volta o código de autorização.
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

**Faça tudo em seguida.** O iFood conclui sozinho os pedidos de envio imediato (confirmado em 01/11/2026: o pedido virou Entregue com o evento de conclusão, e na primeira tentativa o pedido da etapa 4 foi concluído antes do despacho, cerca de 30 minutos depois de gerado). Na etapa final, não marque Entregue à mão: o status chega sozinho. Antes de gerar os pedidos, deixe cadastrados os produtos "PRODUTO 1 - NÃO ENTREGAR - Primeiro Nível" e "PRODUTO 2 (COMBO) - NÃO ENTREGAR - Primeiro Nível": sem eles o Gastrux não confirma o pedido sozinho.

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
