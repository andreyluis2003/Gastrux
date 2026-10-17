# IA na implantação: progresso e cadastros com confirmação

Data: 2026-10-17. Status: aprovado em conversa (seções 1, 2 e 3), aguardando revisão do spec escrito.
Base: "Pergunte ao Gastrux" (`docs/superpowers/specs/2026-10-16-ia-assistente-design.md`), em produção desde `bdabdcf`.

## 1. Objetivo

Um restaurante novo trava na implantação pelo trabalho braçal (cardápio, mesas, equipe), não por falta de explicação.
A IA passa a (a) saber em que ponto a implantação está e puxar o próximo passo e (b) montar os cadastros pesados a partir
de foto, PDF ou texto, sempre como rascunho que o dono revisa e confirma. A IA nunca grava nada sozinha.

Sucesso: um dono novo fotografa o cardápio impresso, revisa e confirma, cria as mesas e a equipe pelo chat, e chega à
primeira venda sem cadastrar item por item.

## 2. Decisões do dono (2026-10-17)

- Uma IA só (a mesma do "Pergunte ao Gastrux"), com um "modo implantação"; nada de agente separado.
- Ações da v1: cardápio (categorias, itens, preços, descrição), mesas e equipe. Fichas técnicas ficam fora.
- Abordagem A: a IA cria um rascunho; o dono revisa numa tela própria e confirma. A confirmação usa o mesmo código das telas.
- Perguntas grátis: nos 30 primeiros dias da conta, as 100 primeiras perguntas não contam no limite do plano (qualquer assunto).
- Etapas novas "Cadastrar as mesas" e "Cadastrar a equipe" (esta opcional).
- Item com nome que já existe no cardápio é pulado (não atualiza preço). Garçom recebe o papel Caixa (não há papel de garçom).

## 3. Degrau 1: progresso da implantação

### 3.1 Etapas

`lib/onboarding/first-steps.ts` passa de 5 para 7 etapas, cada uma concluída pelo que o restaurante fez de verdade:

| chave | rótulo | concluída quando | link |
|---|---|---|---|
| caixa | Abrir o caixa | existe CashSession | /vender |
| venda | Fazer a primeira venda | existe OrderSession CLOSED | /vender |
| cardapio | Cadastrar seus produtos e preços | regra atual (item próprio depois do exemplo) | /admin/cardapio |
| mesas | Cadastrar as mesas | existe Table | /admin/tables |
| equipe | Cadastrar a equipe (opcional) | existe RestaurantUser ativo além do dono | /admin/staff |
| endereco | Completar o endereço | regra atual | /admin/settings |
| nfce | Configurar a nota fiscal (NFC-e) | regra atual | /admin/fiscal |

`FirstStep` ganha `optional?: boolean`. O cartão "Primeiros passos" mostra as 7 etapas; a etapa opcional não impede
"concluído". As etapas cardapio, mesas e equipe ganham um atalho que abre o chat com o pedido preenchido
("Importar meu cardápio por foto", "Criar minhas mesas", "Cadastrar minha equipe").

### 3.2 Ferramenta `progresso_implantacao`

Só leitura, OWNER/MANAGER/ADMIN. Devolve `{ etapas: [{ chave, rotulo, feita, opcional, link }], proxima, diasDeConta }`
a partir de `firstSteps`. Entra na base de conhecimento (`lib/ai/knowledge/implantacao.ts`) o roteiro de implantação.

### 3.3 Chat que puxa a conversa

- `GET /api/ai/onboarding` (OWNER/MANAGER/ADMIN): `{ active, done, total, next: { label, href } | null, free: { used, limit } | null }`.
  `active` = conta com até 30 dias e alguma etapa obrigatória pendente. Não chama a IA.
- Com `active`, o botão do chat mostra uma bolinha; ao abrir a conversa vazia aparece "Faltam N de 7: próxima, <etapa>"
  e as sugestões viram as de implantação. O chat não abre sozinho.

### 3.4 Perguntas grátis na implantação

- `ai_questions` ganha `free Boolean @default(false)`.
- Em `askQuestion`, dentro do mesmo trecho com trava (`ai-ask:<rid>`): se a conta tem até 30 dias (`restaurant.createdAt`)
  e o restaurante tem menos de 100 perguntas `free = true`, a pergunta é reservada com `free = true, counted = false`
  e não passa pelo limite do mês. A taxa de 10 por minuto continua valendo.
- Resposta da API ganha `free: { used, limit: 100 } | null`; o chat mostra "Implantação: 12 de 100 perguntas grátis".
- Erro de API: `free` volta a `false` (não gasta a cota grátis), `counted = false` como hoje.
- Tela "Uso da IA": linha marcada "grátis (implantação)" e o resumo mostra a cota grátis enquanto valer.

## 4. Degrau 2: cadastros com rascunho e confirmação

### 4.1 Anexos no chat

- Só OWNER/MANAGER/ADMIN veem o botão de anexo.
- Até 4 fotos (JPEG/PNG/WebP) reduzidas no celular para no máximo 1568 px no lado maior, ou 1 PDF de até 10 páginas e 5 MB.
  Enviadas como base64 no `POST /api/ai/ask` (`attachments: [{ type: 'image' | 'pdf', mediaType, data }]`).
- O servidor valida tipo, tamanho (imagem até 1,5 MB depois de reduzida; corpo total até 8 MB) e quantidade antes de chamar a IA;
  fora disso responde 400 com mensagem clara.
- Com anexo, a pergunta usa o modelo detalhado (`AI_MODEL_DETAILED`) em qualquer plano, `max_tokens` 8000, e conta como uma pergunta
  (grátis na implantação). Os anexos entram só na primeira mensagem do usuário; não são guardados; o log grava
  `attachments: { images: n, pdf: bool }`.

### 4.2 Ferramentas de proposta (OWNER/MANAGER/ADMIN)

Nenhuma grava no restaurante; cada uma cria um rascunho e devolve `{ rascunhoId, resumo }` ao modelo.

- `propor_cardapio { categorias: [{ nome, itens: [{ nome, descricao, preco }] }], incompleto }` (`preco` em reais, número; `descricao` pode ser "").
- `propor_mesas { quantidade, inicio, area, lugares }` (padrões no prompt: área "Salão", 4 lugares, início = maior número + 1).
- `propor_equipe { pessoas: [{ nome, email, papel }] }`, `papel` em `GERENTE | CAIXA | COZINHA` (garçom = CAIXA); e-mail pode vir "" e
  então a tela exige.

Schemas `strict`, como as demais ferramentas. Papel do usuário checado de novo em `runTool`.

### 4.3 Rascunho

Modelo novo `AiDraft` (`ai_drafts`): `id, restaurantId, createdById, questionId?, kind (MENU | TABLES | STAFF), payload Json,
status (PENDING | APPLIED | DISCARDED), expiresAt (criação + 7 dias), appliedAt?, appliedById?, result Json?, createdAt`.
Índice `(restaurantId, createdAt)`. Expirado = `PENDING` com `expiresAt` no passado (sem rotina).

A resposta de `POST /api/ai/ask` ganha `drafts: [{ id, kind, resumo }]`; o chat mostra para cada um o botão
"Revisar e confirmar" → `/implantacao/revisar/[id]`.

### 4.4 Tela de revisão `/implantacao/revisar/[id]`

OWNER/MANAGER/ADMIN do restaurante do rascunho; outro restaurante = 404. Feita para celular.

- `GET /api/ai/drafts/[id]`: rascunho + marcações calculadas na hora (item que já existe pelo nome, sem diferenciar
  maiúsculas e acentos; número de mesa que já existe na área; e-mail inválido ou já em outro restaurante; limite de usuários do plano).
- Cardápio: lista por categoria; cada linha edita nome, preço ("32,90") e categoria, ou é removida; "já existe, não será criado";
  aviso "pode estar incompleto, confira o final" quando `incompleto`; se a conta ainda tem o cardápio de exemplo (receitas `DEMO-`),
  caixa "Remover o cardápio de exemplo" (desmarcada).
- Mesas: "Mesas 1 a 10, Salão, 4 lugares", editável; números existentes pulados.
- Equipe: nome, e-mail, papel por pessoa; papéis que o usuário pode dar (dono: Gerente/Caixa/Cozinha; gerente: Caixa/Cozinha);
  aviso quando passa do limite de usuários do plano (`checkTierLimit(rid, 'users')`).
- Botões "Confirmar" e "Descartar". Rascunho confirmado, descartado ou expirado: a tela diz e oferece voltar ao chat.

### 4.5 Confirmação `POST /api/ai/drafts/[id]/apply`

- Corpo: o conteúdo revisado (mesmo formato do payload) + `removeExample` (cardápio). O servidor revalida tudo e não confia
  no conteúdo da IA: preço entre 0,01 e 99.999, nomes até 120 caracteres, no máximo 300 itens, 200 mesas e 30 pessoas,
  e-mails válidos, papéis permitidos.
- Aplica uma vez só: trava `ai-draft:<id>` + status `PENDING` checado dentro da transação; segundo toque = 409 com o resultado anterior.
- Cardápio e mesas numa transação (tudo ou nada):
  - categorias criadas ou reaproveitadas pelo nome; itens novos com a ficha simples (`ensureMenuItemRecipes`, lógica de
    `lib/cardapio/product-recipe.ts`), pulando os que já existem;
  - `removeExample`: desativa os itens e receitas `DEMO-` (mesma regra de "cardápio de exemplo" de `first-steps`);
  - mesas pela mesma lógica de `app/api/admin/tables` (área criada se não existir, QR gerado), pulando números existentes.
- Equipe: a criação de funcionário sai de `app/api/admin/staff/route.ts` para `lib/staff/create-member.ts` (usada pela rota e
  pela confirmação). Cada pessoa é criada separadamente; o resultado diz quem entrou e quem não, com o motivo.
  A senha temporária de cada nova pessoa aparece só na tela de resultado; nunca vai para a IA, para `ai_drafts.result`
  nem para `ai_questions`.
- `recordAudit` com tipo, quantidades e id do rascunho.

### 4.6 Atalhos

Nos "Primeiros passos", etapas cardapio, mesas e equipe abrem o chat com o pedido preenchido (evento de janela que o
`GastruxChat` escuta: abrir + preencher a caixa de texto, sem enviar).

## 5. Segurança

- Restaurante e papel vêm da sessão; ferramentas de proposta, anexos, tela e confirmação só OWNER/MANAGER/ADMIN; caixa e cozinha
  não recebem as ferramentas e, se pedirem, recebem recusa registrada em `deniedTools`.
- Texto dentro de foto ou PDF ("ignore as instruções") é só conteúdo; no pior caso vira um rascunho que o dono vê e descarta.
- Nenhum dado pessoal de cliente; e-mail de funcionário fica só no rascunho e no cadastro.
- Fotos e PDFs não são guardados.

## 6. Erros

- Foto ilegível: a IA responde "Não consegui ler o cardápio. Tente uma foto mais de perto ou cole o texto." e não cria rascunho.
- Resposta cortada (`max_tokens`) durante `propor_cardapio`: o rascunho só existe se a ferramenta foi chamada; a IA é instruída
  a marcar `incompleto` quando o cardápio é longo demais e a dividir em partes ("mande as próximas páginas").
- Arquivo grande ou tipo errado: 400 antes de chamar a IA.
- Rascunho expirado, confirmado ou descartado: 409/410 com mensagem; tela oferece recomeçar.
- Falha na confirmação: cardápio/mesas não gravam nada; equipe mostra o resultado por pessoa.

## 7. Planos

Implantação (progresso, perguntas grátis, anexos, rascunhos) em todos os planos. Limite de usuários do plano vale na equipe.

## 8. Testes

- Etapas: 7 etapas, equipe opcional, mesas/equipe concluídas pelos dados.
- Perguntas grátis: conta com 29 dias e 99 grátis → grátis; a 101ª conta; conta com 31 dias conta; erro de API não gasta a cota.
- Anexos: tipo/tamanho/quantidade inválidos → 400 sem chamar a IA; caixa/cozinha com anexo → 403; com anexo usa o modelo detalhado.
- Cada ferramenta de proposta cria rascunho e não grava cardápio, mesas ou usuários; cozinha pedindo `propor_cardapio` → recusa.
- Confirmação: cria itens com ficha simples, pula duplicados, remove exemplo quando pedido, cria mesas com QR pulando existentes,
  cria equipe com senha temporária e `mustChangePassword`; duplo toque aplica uma vez; outro restaurante 404; cozinha 403;
  conteúdo inválido recusado; senha não aparece em `ai_drafts`/`ai_questions`.
- Rota de equipe atual continua passando (refatoração para `lib/staff/create-member.ts`).
- IA sempre simulada nos testes; teste real em homolog com cardápio impresso fotografado no celular.

## 9. Fora desta versão

Fichas técnicas com insumos; importar cardápio do iFood por link; atualizar preço de itens existentes; fotos dos pratos;
importar clientes ou vendas de outro sistema.

## 10. Conhecimento da IA

`lib/ai/knowledge/implantacao.ts` (etapas, como importar por foto, revisar e confirmar, perguntas grátis) e atualização de
`planos.ts` e `equipe.ts`. Manual (Claude Doc): seção da IA com implantação.
