# Cardápio mais rápido de editar (2026-11-06)

Item 4 da comparação com o Anota AI. O dono disse "pode decidir": as decisões são minhas.

## Por quê

No meio do expediente o dono precisa tirar um item que acabou, corrigir um preço ou subir os preços de uma
categoria. Hoje cada mudança é abrir o produto, editar e salvar. O "esgotar" existe, mas é um ícone de olho
com o texto "Desativar", que ninguém entende como "acabou".

## O que já existe (recon)

- `MenuItem.available = false` já tira o item de todos os canais: Vender (`lib/vender/rules.ts`, venda balcão),
  QR Code, site de delivery, WhatsApp, sugestões e a criação de pedidos públicos.
- `PUT /api/cardapio/itens/[id]` aceita `price` sem validar (texto vira NaN e erro 500; negativo passa).
- `Restaurant.timezone` (padrão America/Sao_Paulo).

## Decisões

1. **Esgotar claro:** o ícone de olho vira o botão de texto **Esgotar** / **Voltar a vender**; item esgotado
   ganha a etiqueta **Esgotado**. No título de cada categoria, **Esgotar todos** / **Voltar todos**. Mesmo campo
   `available`, nenhum canal novo. O iFood não é avisado (não temos o módulo de catálogo do iFood): a ajuda diz
   para pausar o item também no Gestor de Pedidos do iFood.
2. **Preço na lista:** tocar no preço abre um campo; Enter ou sair do campo salva, Esc cancela. Valida de
   R$ 0,01 a R$ 99.999. A ficha simples acompanha o preço (`syncProductRecipe`), como no editar.
3. **Seleção em massa:** caixa em cada item e "selecionar a categoria"; com algo marcado aparece uma barra
   fixa embaixo: **Esgotar**, **Voltar a vender**, **Ajustar preço (%)**, **Mover para categoria**,
   **Mostrar/Ocultar no QR e no site** e **Dias da semana**. Uma rota nova
   `POST /api/cardapio/itens/lote` (dono e gerente) faz tudo, conferindo que cada item é do restaurante.
   Ajuste de −50% a +50%, arredondado ao centavo; produto vendido por peso ajusta o preço por kg.
4. **Dias da semana:** campo novo `MenuItem.availableDays Int[]` (0 = domingo … 6 = sábado; vazio = todos os
   dias). Fora do dia, o item some **dos canais do cliente**: QR Code, site de delivery, WhatsApp, sugestões e a
   criação de pedidos públicos (um carrinho antigo não compra fora do dia). O dia é o do fuso do restaurante.
   **Vender continua mostrando** (a equipe decide; aparece a etiqueta "Hoje não"). A lista mostra "Só sáb e dom".
   Editável no editar do produto e em massa.
5. **Migração** `availableDays` com padrão vazio. Como toda consulta de `MenuItem` sem `select` lê a coluna, ela
   precisa existir ANTES do Deploy (mesma ordem do primeiro acesso guiado): `ALTER TABLE ... ADD COLUMN IF NOT
   EXISTS` no container antigo, Deploy, `migrate deploy`; homolog e depois app.

## Fora

Disponibilidade por horário (só dia); avisar o iFood; desfazer em massa; reordenar arrastando.

## Junto

Ajuda (artigo do cardápio), base da IA, manual, pendências.
