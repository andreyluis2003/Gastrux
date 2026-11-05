# Primeiro acesso guiado

Data: 2026-11-05. Item 6 do comparativo com o Anota AI (`project_gastrux-anota-ai-benchmark`). O dono disse
"pode decidir": as decisões abaixo são minhas e estão marcadas como tal quando não vieram dele.

## Por quê

A campanha "Sinop v3" (WhatsApp) começou a trazer contas de teste. Hoje quem entra pela primeira vez vê o Início
com o botão Vender e um cartão "Primeiros passos" (7 itens, `components/dashboard/first-steps.tsx`), mas:

- o cartão só existe no Início: ao sair dele, o dono perde o fio;
- nada mostra **onde clicar**: "Fazer a primeira venda" leva ao Vender e para ali;
- a lista é a mesma para uma pizzaria de delivery e um bar de mesas;
- não diz quanto tempo cada passo leva, e o dono não sabe se cabe agora.

O Anota AI resolve isso com um pedido de teste guiado na primeira entrada e um "Comece por aqui" flutuante com os
minutos de cada passo. Sucesso: o dono de teste faz um pedido completo (comanda, cozinha, conta) nos primeiros
minutos e sabe qual é o próximo passo em qualquer tela.

## O que entra

### 1. "Comece por aqui" em todas as telas

- Um botão flutuante no **canto de baixo à esquerda** (o da direita é o assistente de IA), com o progresso:
  "Comece por aqui · 3 de 8". Ao tocar, abre um painel com os passos.
- Aparece para quem configura o restaurante (OWNER, MANAGER, ADMIN; a mesma regra do cartão de hoje) enquanto o
  guia está ativo: até 30 dias depois do cadastro (`ONBOARDING_DAYS`) e com algum passo obrigatório por fazer.
- Pode ser escondido ("Esconder o guia"), neste aparelho (localStorage), como o cartão de hoje. Volta pelo Início.
- Não aparece na tela da comanda num celular (a barra fixa de baixo ocuparia o mesmo lugar), a não ser durante o
  pedido de teste. Minha decisão.

### 2. Passos em grupos, conforme o jeito de vender

O painel pergunta uma vez **"Como você vende?"** com três opções que podem ser marcadas juntas: **Balcão**,
**Mesas** e **Delivery**. A resposta fica no restaurante (vale em todos os aparelhos) e pode ser mudada no painel.
Antes da resposta, vem marcado o mais comum para o tipo de negócio escolhido no cadastro (minha decisão):

| Tipo (`users.businessType`) | Marcado de início |
|---|---|
| restaurantes, bar, espetaria | Balcão, Mesas |
| pizzaria, hamburgueria, japones, marmitaria, acai, lanchonete, doceria | Balcão, Delivery |
| padaria, cafeteria, sem resposta | Balcão |

Grupos e passos (minutos estimados, minha decisão):

**Comece por aqui** (sempre)
1. Fazer o pedido de teste guiado — 3 min (novo; feito quando o tour termina)
2. Cadastrar seus produtos e preços — 10 min (já existe; com "Fazer com a IA" e "Ver vídeo")
3. Abrir o caixa — 1 min (já existe)
4. Fazer a primeira venda — 2 min (já existe)
5. Completar o endereço — 1 min (já existe)
6. Configurar a nota fiscal (NFC-e) — 15 min (já existe)

**Mesas** (se marcado)
7. Cadastrar as mesas — 2 min (já existe; "Fazer com a IA")
8. Imprimir os QR Codes das mesas — 3 min (novo; feito ao abrir a impressão em `/admin/tables/qrcodes`)
9. Cadastrar a equipe — 3 min, opcional (já existe)

**Delivery** (se marcado)
10. Copiar o link do seu site de delivery — 1 min (novo; feito ao tocar "Copiar link" em `/admin/delivery-site`)
11. Fazer um pedido de teste pelo site — 3 min (novo; feito quando existe um pedido do site de delivery desta loja:
    um `ExternalOrder` da integração própria `delivery_site`, criada em `app/api/public/delivery/order/route.ts`)

Sem nenhum canal marcado além de Balcão, os grupos Mesas e Delivery não aparecem. A equipe continua opcional em
qualquer caso. O passo do iFood entra quando a conexão existir de verdade (fica em `docs/pendencias.md`).

O cartão "Primeiros passos" do Início passa a mostrar **os mesmos grupos** (o mesmo componente), para não haver
duas listas diferentes. O botão "Vender" do Início continua.

### 3. Pedido de teste guiado (setas na tela)

Um tour que roda nas telas de verdade, com um destaque piscando em volta do botão certo e um balão com uma frase
curta. Não cobre a tela: o dono clica no próprio botão. Sempre há "Sair do tour".

Os passos (cada alvo ganha um atributo `data-tour`):

1. **Vender**, caixa fechado: destaque em "Abrir caixa". "Primeiro, abra o caixa. Pode deixar o troco em R$ 0,00."
   Avança quando o caixa abre. Com o caixa já aberto, este passo é pulado.
2. **Vender**: "Comanda por nome". "Toque em Comanda por nome." Avança ao tocar.
3. **Vender**: o campo do nome. "Escreva Pedido de teste e toque em Abrir." Avança quando a comanda abre.
4. **Comanda**: o primeiro produto do cardápio. "Toque num produto para lançar." Avança ao lançar.
5. **Comanda**: "Enviar para cozinha" (o botão visível: o do painel no computador, o da barra no celular).
   "Agora envie para a cozinha." Avança ao tocar.
6. Balão sem alvo: "Veja como o pedido chega na cozinha." Botão "Abrir a cozinha" (`/cozinha`).
7. **Cozinha**: o cartão do pedido. "O pedido chegou. A cozinha toca para avançar: em preparo, pronto." Botão
   "Entendi".
8. Balão: "Volte à comanda para ver a conta." Botão "Voltar à comanda" (a comanda do teste).
9. **Comanda**: "Conta". "Em Conta você recebe e fecha a venda: dinheiro, PIX, cartão, dividir." Botão "Entendi".
10. Fim: "Pronto! Você fez um pedido completo." Botão principal **"Cancelar o pedido de teste"**, que cancela a
    comanda pelo caminho que já existe (`DELETE /api/comanda/sessions/[id]`, motivo "Pedido de teste do primeiro
    acesso"), para o teste não entrar no faturamento nem nos relatórios. O passo 1 do guia fica feito.

Regras:

- Só começa com pelo menos um produto no cardápio; sem produto, o painel mostra "Cadastre um produto antes" com o
  link do cardápio (a conta em branco não tem produto; a com modelo já tem).
- O andamento do tour fica no aparelho (localStorage): sair da tela e voltar continua do mesmo passo. O "feito"
  do passo 1 fica no restaurante.
- Se o alvo não aparece em alguns segundos (outra tela, celular com menu fechado), o balão aparece sozinho, no
  canto, com o texto e um link "Ir para a tela".
- Funciona no computador e no celular (390 px).
- Só para OWNER, MANAGER e ADMIN (cancelar a comanda exige gerente).

## Dados

- `restaurants.onboardingGuide` (Json, pode ser nulo; migração nova): `{ channels?: ('balcao'|'mesas'|'delivery')[],
  marks?: { testOrder?: string, qrcodes?: string, deliveryLink?: string } }` (datas ISO). Nulo = canais pelo tipo de
  negócio e nada marcado.
- `GET /api/onboarding/guide`: os grupos com os passos (rótulo, minutos, link, feito, opcional), o progresso e se o
  guia está ativo. `PATCH /api/onboarding/guide`: `{ channels }` ou `{ mark: 'testOrder'|'qrcodes'|'deliveryLink' }`.
  OWNER, MANAGER e ADMIN do restaurante atual.
- `lib/onboarding/first-steps.ts` continua a fonte do "feito" dos passos existentes; um novo `lib/onboarding/guide.ts`
  monta os grupos. `onboardingStatus` (usado pela IA) passa a contar os passos do guia.

## Fora (de propósito)

- Tour das outras telas (estoque, ficha técnica, fiscal): os vídeos tutoriais já cobrem; um tour por tela fica para
  depois de ver se o do pedido de teste é usado.
- Pedido de teste do delivery guiado com setas (o passo 11 só leva ao site).
- Passo do iFood.
- Medir o uso do tour (eventos de analytics).

## Não pode acontecer

- O pedido de teste ficar no faturamento, no caixa ou nos relatórios sem o dono saber (por isso o cancelamento no
  fim; se ele sair antes, a comanda "Pedido de teste" fica aberta no Vender como qualquer outra).
- O destaque bloquear o clique no botão de verdade, ou cobrir a barra fixa da comanda no celular.
- Mostrar o guia para o cozinheiro ou o caixa.

## Junto

- `lib/ai/knowledge/*` (implantação) e um artigo de ajuda novo em `lib/help/seed-articles.ts` ("Comece por aqui e o
  pedido de teste").
- Manual (Claude Doc), seção de implantação.
