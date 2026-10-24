# Roteiro da homologação do iFood (Pedidos e Eventos)

Para o dono da conta de desenvolvedor da Help Flow no iFood. Só o dono da conta pode pedir a homologação, e o iFood
aceita uma tentativa a cada 4 horas. Cada etapa aceita até cinco prints.

## Antes de começar

1. **App de produção:** no Portal do Desenvolvedor, em "Meus apps", crie o app de produção do tipo **distribuído**, na
   categoria **PDV**. O app de teste não pode ser homologado.
2. **Credenciais no Easypanel:** coloque as do app de produção nas variáveis do app:
   - `IFOOD_CLIENT_ID` e `IFOOD_CLIENT_SECRET`;
   - `IFOOD_APP_MODE=distributed`;
   - `IFOOD_POLLING=on`.

   Depois, Deploy.
3. **Ligar a loja de teste:** no Gastrux, em **Configurações > iFood**, clique em **Conectar iFood**. Digite
   o código no Portal do Parceiro e cole de volta o código de autorização.
4. **Conferir:** a tela do iFood no Gastrux deve mostrar **Conectada**, e a loja de teste deve aparecer aberta no iFood.

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
