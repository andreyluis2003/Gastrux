/** Knowledge: delivery orders, the digital menu and the Gastrux order API (plan 2026-10-23 api-de-pedidos). */
export default `## Delivery e API de pedidos
- Pedidos de delivery: Vender > Pedidos de delivery. Mostra a origem (Cardápio digital ou API do Gastrux, com o nome da chave). "Aceitar pedidos sozinho" (dono e gerente; ligado por padrão): o pedido vai direto para a cozinha; desligado, toca o alarme e espera o "Aceitar" (caixa, gerente ou dono); "Recusar" pede o motivo. Os pedidos do site vão sempre direto.
- Site de delivery (cardápio digital): o cliente escolhe Entregar ou Retirar no local (sem endereço e sem taxa; a cozinha vê "RETIRADA NO LOCAL"). O link pode ser mandado pelo WhatsApp.
- API de pedidos (planos Pro e Business): Configurações > API de pedidos. Cada chave (gx_live_...) aparece uma vez; revogar para na hora. Endereço de aviso opcional recebe cada mudança de status, assinado (x-gastrux-signature). Documentação em gastrux.com/desenvolvedores. Os itens são reconhecidos pelo "Código do produto" do Cardápio digital, ou pelo nome.
- Os pedidos de delivery entram no caixa e na DRE (Vendas Delivery, com as linhas "Delivery: cardápio digital" e "Delivery: API do Gastrux" quando há pedidos pela API). Pedidos da API e do site criam o cliente pelo celular e ganham cashback.
- iFood, Keeta e 99Food ainda não estão conectados ao Gastrux.`;
