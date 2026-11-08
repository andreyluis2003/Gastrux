# Todos os pedidos e loja aberta/fechada (2026-11-07)

Item 5 da comparação com o Anota AI. O dono disse "pode seguir" (mesma regra do "pode decidir"): as decisões
são minhas.

## Por quê

Hoje o restaurante olha três telas para saber o que está acontecendo: Vender (mesas e balcão), Pedidos de
delivery (site, API, iFood) e a Cozinha. No pico, o caixa quer uma tela só com tudo que está aberto e de onde
veio. E não existe "fechar a loja": os horários ficam cadastrados, mas nada os usa; fora do horário o site
continua recebendo pedidos.

## Recon

- Pedido de cozinha (`Order`) existe para todos os canais; a origem sai de `externalOrder.integration.platform`
  (delivery_site, ifood, gastrux_api...), da comanda (`orderSession`: mesa, ou balcão/nome) e do texto
  "Pedido via WhatsApp" que o robô grava em `notes`.
- Pedido externo esperando "Aceitar" ainda não tem `Order` (`ExternalOrder.status = PENDING`).
- `Restaurant.businessHours` existe e não é usado para nada. iFood: `setPaused` já existe (o iFood fecha a loja
  em minutos quando o Gastrux para de conversar).

## Decisões

### A. Loja aberta / fechada

1. Botão no topo de **Todos os pedidos** e de **Pedidos de delivery**: "Loja aberta" / "Loja fechada". Fechar
   pede confirmação. Dono, gerente e caixa (é decisão do dia a dia do balcão).
2. Fechada, **não entra pedido novo de cliente de fora**: site de delivery (a página mostra "Fechado agora" e
   não deixa finalizar; o servidor recusa), WhatsApp (o robô responde que está fechado e manda o link do
   cardápio), API de pedidos (recusa com erro claro) e iFood (pausado; volta quando reabrir, só se foi o fechar
   que pausou).
3. **Não afeta** o salão: Vender, QR Code da mesa e comandas seguem normais.
4. Campos novos `Restaurant.ordersClosedAt` (nulo = aberta) e `Restaurant.ordersClosedPausedIfood`. Manual, sem
   abrir/fechar pelo horário (fica para depois; os horários nunca foram conferidos com a operação real).
5. Migração com `IF NOT EXISTS`, coluna criada antes do Deploy (toda consulta de restaurante sem `select` lê).

### B. Todos os pedidos (`/pedidos`)

6. Tela nova em **Vender > Todos os pedidos**, para quem vê Pedidos de delivery. Quadro com quatro colunas:
   **Novos** (pedido externo esperando aceitar), **Em preparo** (na cozinha), **Prontos** e **Em entrega**.
7. Fonte: pedidos de cozinha não concluídos das últimas 24 h e pedidos externos pendentes ou saindo para
   entrega. Um pedido aparece uma vez.
8. Cada cartão: origem (Mesa 4, Balcão: Ana, Site, iFood #1234, WhatsApp, API), número, itens, total, há quanto
   tempo. Tocar abre a tela certa (comanda no Vender, Pedidos de delivery ou a Cozinha). **Só leitura**: aceitar,
   recusar e mudar etapa continuam nas telas de origem (nenhuma regra nova de status).
9. Filtro por canal no topo (Todos, Salão, Balcão, Site, WhatsApp, iFood, API) com a contagem de cada um,
   lembrado no aparelho. Atualiza sozinha a cada 15 s.

## Fora

Abrir/fechar automático pelo horário; ações no próprio quadro; som de pedido novo nesta tela (o sino continua em
Pedidos de delivery).

## Junto

Ajuda, base da IA, manual, pendências, item no menu.
