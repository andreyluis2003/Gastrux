# Etiquetas de manipulação e controle de validades — Design

**Data:** 2026-10-09
**Status:** design aprovado em chat (3 partes), aguardando revisão deste documento
**Origem:** backlog item 5 (pedido do dono em 2026-10-04: integração com a Suflex; decisão: construir dentro da Gastrux). Goomer e Anota AI não têm etiquetas nem validades: é diferencial.

## 1. Problema

A RDC 216/2004 da ANVISA e as vigilâncias sanitárias exigem que alimentos preparados e insumos abertos fiquem identificados com o que são, quando foram preparados ou abertos e até quando valem. Hoje o restaurante faz isso à mão (caneta e fita) ou com outro sistema (Suflex). A Gastrux já tem as fichas técnicas, os insumos, os lotes de compra (`IngredientBatch`, tela ANVISA → Lotes) e a impressão pelo navegador (cupom e ticket da cozinha, `lib/print/print-frame.ts`), mas não imprime etiquetas nem controla o que vence.

## 2. Objetivo e critério de sucesso

Etiquetar em segundos, no celular ou tablet da cozinha, e nunca deixar um pote vencido passar despercebido.

**Sucesso:**
- item escolhido → etiqueta impressa: **conservação → Imprimir** (2 toques), validade calculada sozinha;
- toda etiqueta impressa fica registrada, com quem fez e quando;
- de manhã, dono e gerente sabem o que venceu e o que vence no dia; o descarte entra no Desperdício com o custo certo.

## 3. Decisões do dono (2026-10-09)

1. Etiquetas para **preparos da cozinha** (a partir das fichas técnicas) **e insumos abertos**.
2. Validade **por item e por conservação** (ambiente, refrigerado, congelado), com padrões que o gerente ajusta; quem etiqueta só escolhe a conservação e pode corrigir a data.
3. **Impressora térmica de etiqueta pelo navegador** (Elgin L42, Argox, Zebra instaladas no Windows), tamanhos **60×40 mm** (padrão) e **40×25 mm**.
4. **Registro + vencimentos:** cada etiqueta registrada; tela de validades; aviso no sino; baixa "usado" ou "descartado", com o descarte no Desperdício.
5. Planos: **imprimir em todos os planos; controle de validades do Pro para cima.**

## 4. Regras

### 4.1 Validade por item
- Fichas técnicas (`Recipe`) e insumos (`Ingredient`) ganham três campos opcionais, em dias: `shelfLifeAmbientDays`, `shelfLifeChilledDays`, `shelfLifeFrozenDays`. Vazio = aquela conservação não se aplica ao item.
- Padrões ao criar (e para os itens que já existem, na migração): **preparo** ambiente 0, refrigerado 3, congelado 30; **insumo** refrigerado 3 (ambiente e congelado vazios). O gerente muda na ficha do item.
- **0 dias = consumir no dia:** a validade é às 23:59 do dia do preparo (horário de Brasília).
- **N dias (N ≥ 1):** validade = data e hora do preparo + N × 24 h.
- A validade calculada pode ser trocada na hora da impressão; uma validade anterior ao momento atual é recusada.
- Item sem nenhum dos três campos: a tela pede a validade manual (data e hora) e oferece a dono e gerente "salvar como padrão deste item" (grava os dias da conservação escolhida).

### 4.2 Etiqueta
Registro novo `FoodLabel`, um por etiqueta física:
- restaurante; tipo (`RECIPE` ou `INGREDIENT`); `recipeId` ou `ingredientId`; **nome do item na hora da impressão** (fica certo mesmo se o item for apagado ou renomeado);
- conservação (`AMBIENT`, `CHILLED`, `FROZEN`); `preparedAt` (preparado ou aberto em); `expiresAt`;
- quantidade e unidade opcionais: a unidade é fixa pelo item (rendimento da ficha, `Recipe.yieldUnit`; unidade padrão do insumo, `Ingredient.standardUnit`), sem conversão;
- lote opcional (`IngredientBatch`, só para insumo, do mesmo restaurante);
- quem imprimiu; situação `ACTIVE`, `USED`, `DISCARDED`; quando e quem deu baixa; motivo do descarte.
- "Vencida" não é uma situação gravada: é uma etiqueta `ACTIVE` com `expiresAt` no passado.
- **Várias iguais:** "3 etiquetas" cria 3 registros, cada um com seu QR (3 potes, 3 baixas).

### 4.3 Descarte e Desperdício
- **Insumo com quantidade:** um `WasteLog` do insumo com a quantidade da etiqueta, custo estimado = quantidade × `Ingredient.referenceCost`.
- **Preparo com quantidade:** um `WasteLog` por insumo da ficha, proporcional: quantidade do insumo na ficha × (quantidade da etiqueta ÷ `Recipe.baseYield`), custo pelo `referenceCost` de cada insumo. Assim o CMV e o Desperdício contam o que foi jogado fora de verdade.
- Motivo: `EXPIRED` se a etiqueta já venceu; senão `OTHER`, com a observação "Descartado antes do vencimento (etiqueta)".
- **Sem quantidade:** só a etiqueta muda para `DISCARDED`; nada entra no Desperdício.
- Baixa é uma vez: uma etiqueta já usada ou descartada não muda de novo (409).

## 5. Telas

Menu **Estoque e compras → Etiquetas**, para dono, gerente e cozinheiro (`OWNER`, `MANAGER`, `ADMIN`, `COOK`; o caixa não vê).

### 5.1 Imprimir (todos os planos)
Pensada para celular e tablet da cozinha:
- busca única com **preparos e insumos** juntos, os mais etiquetados nos últimos 30 dias no topo;
- ao escolher, botões grandes só das conservações com dias definidos (**Ambiente / Refrigerado / Congelado**);
- validade calculada em destaque ("Validade: 12/10 às 14:30") com **Mudar**;
- opcionais: quantidade (com a unidade do item), lote (insumo), número de etiquetas (1 a 20);
- **Imprimir** registra e abre a impressão no tamanho do restaurante; o histórico de impressões (últimos 30 dias) tem **Reimprimir**;
- exige internet (a etiqueta precisa do registro e do QR): sem conexão, aviso como o de receber pagamento.

### 5.2 Etiqueta impressa
- **60×40 mm:** nome do item; "Preparado em" (preparo) ou "Aberto em" (insumo) com data e hora; **"Validade" com data e hora em destaque**; conservação; responsável (primeiro nome); quantidade e lote, se houver; nome do restaurante; QR Code.
- **40×25 mm:** nome, validade em destaque, preparado/aberto em, conservação e QR (sem lote e sem restaurante).
- Página de impressão própria (`/imprimir/etiqueta/...`), como o cupom (`/imprimir/cupom/[id]`), com `@page` no tamanho certo e sem margens.

### 5.3 Validades (Pro para cima)
Etiquetas ativas em três grupos: **Vencidas** (vermelho, no topo), **Vencem hoje** (amarelo), **Vencem amanhã**. Cada linha: item, conservação, validade, responsável, quantidade; botões **Usado** e **Descartado**. Filtro **Histórico**: usadas e descartadas dos últimos 30 dias.

### 5.4 QR Code
Abre `/etiquetas/[id]` no celular: item, datas, responsável, situação, com **Usado** e **Descartado** (Pro para cima; no Starter só leitura, com "Controle de validades no plano Pro"). Exige login de alguém do **mesmo restaurante**; outra pessoa (ou um cliente que escaneie o pote) não vê nada.

### 5.5 Configurações
- Ficha técnica e insumo: os três campos de dias de validade.
- Configurações do restaurante: tamanho da etiqueta (60×40 ou 40×25), padrão 60×40.

## 6. Aviso da manhã (Pro para cima)

Rotina diária às **07:00 de Brasília** (rota protegida por `CRON_SECRET`, chamada pelo crontab do servidor como as rotinas de pagamentos e da cozinha). Para cada restaurante Pro, Business ou Enterprise com etiquetas vencidas ou vencendo hoje, um aviso do restaurante no sino (dono e gerente veem, `lib/notification-utils.ts`), por exemplo "2 etiquetas vencidas e 3 vencem hoje", com link para Validades. Um aviso por restaurante por dia (chave de deduplicação com a data).

## 7. Planos

Novo recurso no `lib/tier-guard.ts`: `labelExpiry` em `pro`, `business`, `enterprise`. Imprimir, reimprimir, histórico de impressão e dias de validade nas fichas valem em todos os planos. Tela de Validades, baixa (Usado/Descartado), descarte no Desperdício e aviso da manhã exigem `labelExpiry`. Página de preços e textos do site passam a citar "Etiquetas de manipulação" em todos os planos e "Controle de validades" do Pro para cima.

## 8. Dados (uma migração)

- Tabela `food_labels` (seção 4.2), com índices por restaurante + situação + validade.
- `recipes` e `ingredients`: `shelfLifeAmbientDays`, `shelfLifeChilledDays`, `shelfLifeFrozenDays` (inteiros, opcionais), preenchidos com os padrões da seção 4.1 nos registros existentes.
- `restaurants`: `labelSize` (`60x40` | `40x25`, padrão `60x40`).

## 9. Erros e casos difíceis

- Duplo toque em Imprimir: protegido pela chave de repetição (`idempotent`, `lib/api/idempotency.ts`), como as outras telas.
- Item de outro restaurante, lote de outro restaurante ou de outro insumo: 404.
- Validade no passado: 400 com mensagem em português.
- Número de etiquetas fora de 1 a 20: 400.
- Baixa repetida: 409.
- Caixa (`CASHIER`) em qualquer rota de etiquetas: 403.

## 10. Testes

- **Unitários:** cálculo da validade em Brasília (0 dia = 23:59 do dia; virada de dia e de mês; N dias), conservações disponíveis por item, matriz de planos (`labelExpiry`).
- **Integração:** imprimir 3 iguais cria 3 registros; permissões (cozinheiro sim, caixa não, outro restaurante não); Starter imprime mas não dá baixa; descarte de insumo e de preparo grava o `WasteLog` proporcional com custo; baixa repetida 409; rotina da manhã cria um aviso por dia e só para Pro+.
- **Navegador (homolog):** imprimir 60×40 e 40×25; Validades com uma etiqueta vencida; QR no celular. A impressão real na térmica é conferida pelo dono.

## 11. Fora desta versão

- Impressão direta sem a janela do navegador (exigiria um programa instalado no computador).
- Folha A4 de etiquetas adesivas.
- Tabela de informação nutricional e alergênicos na etiqueta.
- Baixa automática do estoque ao etiquetar (a etiqueta não movimenta estoque; o descarte entra no Desperdício).
