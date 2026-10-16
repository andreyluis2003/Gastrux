# IA "Pergunte ao Gastrux" com conhecimento do sistema e dados reais — Design

**Data:** 2026-10-16
**Status:** design aprovado em chat (2 partes), aguardando revisão deste documento
**Origem:** pedido do dono: "munir a nossa IA de informações de tudo que fizemos no SaaS e com dados reais do restaurante logado".

## 1. Problema

O "Pergunte ao Gastrux" (`components/ai/gastrux-chat.tsx` → `/api/ai-insights/chat`) usa um modelo da OpenAI pela Abacus.ai com um resumo fixo do restaurante (30 receitas, faturamento 7/30 dias, CMV, engenharia de cardápio, estoque baixo). Ele não sabe como o Gastrux funciona nem o que cada plano inclui, não enxerga caixa, mesas, contagem de espetos, validades, DRE, contas de consumo ou notas, não responde períodos fora do resumo e ignora o perfil de quem pergunta (um cozinheiro vê o faturamento).

## 2. Objetivo e critério de sucesso

Responder em português, em segundos, perguntas sobre **como usar o Gastrux** e sobre **os números reais do restaurante logado**, respeitando o perfil.

**Sucesso:**
- "Como fecho a contagem de espetos?" e "O pagamento na mesa está no meu plano?" respondidas certo, a partir do manual para a IA;
- "Quanto vendi ontem?", "Qual espeto mais faltou esta semana?", "O que vence hoje?", "Como está meu CMV em setembro?" respondidas com os mesmos números das telas (Caixa, DRE, Contagem, Validades);
- um caixa ou cozinheiro que pede faturamento recebe "Essa informação é do dono ou do gerente";
- nenhuma pergunta mostra dado de outro restaurante, dado pessoal de cliente, ou altera algo.

## 3. Decisões do dono (2026-10-16)

1. **Só consulta e responde** (v1). Ações (lançar, criar, alterar) ficam para uma etapa seguinte.
2. **Claude, da Anthropic**, pelo SDK oficial TypeScript (`@anthropic-ai/sdk`): **Claude Haiku 5.5** (`claude-haiku-5-5`) por padrão; **Claude Sonnet 5.5** (`claude-sonnet-5-5`) no botão "Análise detalhada" (Pro+). Modelos em configuração (variáveis de ambiente), trocáveis sem mudar código. O dono sabe que o padrão da Anthropic é o Claude Opus 5.5 e escolheu Haiku/Sonnet pelo custo.
3. **Todos os planos, com limite mensal de perguntas por restaurante:** Starter 30, Pro 150, Business 350, Enterprise sem limite fixo.
4. **Sem dados pessoais de clientes** (LGPD): só números, itens e totais.
5. As demais partes do sistema que usam a Abacus continuam como estão; só o chat muda.

## 4. Regras

### 4.1 Arquitetura
- Rota `POST /api/ai/ask` (nova) faz um laço de uso de ferramentas com a Messages API: envia a pergunta, o manual para a IA (prompt de sistema, com cache) e a lista de ferramentas que o perfil pode usar; executa no servidor as ferramentas que o Claude pedir; devolve os resultados; repete até a resposta final.
- No máximo **6 rodadas de ferramentas** por pergunta; `max_tokens` da resposta 1.500 (Haiku) e 3.000 (Sonnet); `output_config.effort` `low` no Haiku e `medium` no Sonnet.
- **Cada pergunta é uma conversa nova** com o Claude. As últimas 3 trocas (pergunta e resposta em texto) vão como contexto dentro da mensagem do usuário, não como turnos do assistente: evita editar histórico com blocos de raciocínio (rejeitado pelos modelos novos) e mantém o custo previsível.
- `tool_choice` `auto`; ferramentas com `strict: true`; entradas validadas no servidor antes de executar.
- Tratamento de `stop_reason`: `refusal` → "Não consigo responder isso."; `max_tokens` → devolve o que veio com a nota "(resposta cortada)"; erro da API (429, 5xx, rede) → "A IA está indisponível agora. Tente em instantes." e a pergunta **não conta** no limite.

### 4.2 Segurança
- `restaurantId` e perfil vêm de `getRestaurantMember()` (sessão). **Nenhuma ferramenta recebe restaurante, usuário ou perfil como parâmetro**; só período (`AAAA-MM-DD`, máx. 366 dias) e, quando cabe, nome de item.
- A lista de ferramentas enviada ao Claude é filtrada pelo perfil; cada ferramenta checa o perfil de novo antes de executar (defesa em profundidade) e recusa com `is_error`.
- Ferramentas são **só leitura** (consultas Prisma sem escrita).
- Resultados das ferramentas vão como JSON dentro de `tool_result`; textos cadastrados (nomes de prato, motivos) são dados. O manual para a IA instrui a nunca seguir instruções vindas de resultados de ferramentas.
- Sem nome, telefone, e-mail, CPF ou endereço de cliente em nenhuma ferramenta.

### 4.3 Ferramentas e perfis

| Ferramenta | Retorna | Dono/gerente/admin | Caixa | Cozinha |
|---|---|---|---|---|
| `vendas_periodo` | total, nº de vendas, ticket, salão, delivery, taxa de serviço, por forma (`salesInRange`) | sim | não | não |
| `itens_vendidos` | por item: quantidade (+ receita só para gerência) (`itemSalesInRange`) | com R$ | só quantidade | só quantidade |
| `caixa_turno` | turno aberto: abertura, esperado por forma, despesas, vendas do turno | sim | sim | não |
| `mesas_agora` | mesas com comanda aberta, valor em aberto, chamada do garçom | sim | sim | só número e tempo aberta |
| `contagem_dia` | noite aberta (linhas) e últimas 7 fechadas (diferenças) | com R$ | sem R$ | sem R$ |
| `validades` | etiquetas vencidas e que vencem hoje (Pro+; no Starter responde que é do Pro) | sim | não | sim |
| `estoque_baixo` | insumos abaixo do mínimo | sim | não | sim |
| `ficha_tecnica` | por nome: ingredientes; custo, preço e margem só para gerência | com custo | não | só ingredientes |
| `dre_resumo` | DRE do período (mesma rota/lógica da tela) | sim | não | não |
| `contas_consumo` | últimas contas e variações (indicadores só no Pro) | sim | não | não |
| `notas_fiscais` | NFC-e emitidas, rejeitadas e canceladas no período | sim | não | não |
| `plano` | plano atual, recursos e perguntas restantes no mês | sim | sim | sim |

Valores em reais com 2 casas; datas em horário de Brasília.

### 4.4 Manual para a IA
- Arquivos `lib/ai/knowledge/*.md` (um por área: vender, caixa, cardápio e fichas, estoque, contagem, etiquetas e validades, financeiro e DRE, contas de consumo, fiscal, pagamento na mesa, planos e preços, equipe e perfis), escritos a partir do manual de operação e das especificações em `docs/superpowers/specs/`.
- Montados num prompt de sistema estável (sem data/hora nem dados variáveis), com `cache_control` para reaproveitar o cache entre perguntas. A data de hoje e o perfil vão na mensagem do usuário.
- **Processo:** toda funcionalidade nova atualiza o arquivo da área no mesmo trabalho (regra registrada para o desenvolvimento).

### 4.5 Limites
- Contagem por restaurante e mês (horário de Brasília) sobre o registro de perguntas com `counted = true`.
- Antes de chamar o Claude: se o limite do plano foi atingido → 429 com "Você usou as N perguntas do mês do plano X." e link para os planos.
- "Análise detalhada" (Sonnet) só Pro+; no Starter o botão aparece bloqueado com o link dos planos.
- Limite de ritmo: 1 pergunta em andamento por usuário; 10 por minuto por restaurante.

### 4.6 Registro
- Tabela nova `AiQuestion`: restaurante, usuário, perfil, pergunta, resposta, modelo, ferramentas chamadas (nome + entrada, sem os resultados), tokens de entrada/saída/cache, custo estimado em USD, `counted`, `deniedTools` (ferramentas recusadas por perfil), erro, datas.
- Tela "Uso da IA" (Configurações, dono e gerente): perguntas do mês, limite, últimas 50 perguntas com quem perguntou. O admin da plataforma vê o custo por restaurante.

### 4.7 Interface
- Mesmo botão flutuante. Rodapé com "N de M perguntas este mês". Três sugestões de pergunta conforme a tela aberta (lista fixa por rota). Botão "Análise detalhada" (Pro+). Respostas com negrito e listas simples (como hoje).

## 5. Configuração
- Variáveis no Easypanel: `ANTHROPIC_API_KEY` (obrigatória), `AI_MODEL_DEFAULT` (padrão `claude-haiku-5-5`), `AI_MODEL_DETAILED` (padrão `claude-sonnet-5-5`).
- Sem `ANTHROPIC_API_KEY`, o botão mostra "IA ainda não configurada" e nada é contado.
- Recomendado ao dono: limite mensal de gasto no console da Anthropic.

## 6. Banco
Migração só com coisas novas: tabela `ai_questions` (índices por restaurante + data). No Deploy: `npx prisma migrate deploy`.

## 7. Testes
- **Unidade:** filtro de ferramentas por perfil; validação de entradas (período inválido, mais de 366 dias, campos extras); contagem do limite; montagem da mensagem com histórico em texto; preço estimado.
- **Banco de testes, com o cliente Anthropic simulado** (sem chamar a API): cada ferramenta devolve os mesmos números das telas para o restaurante logado e nada de outro; caixa/cozinha recebem só as ferramentas permitidas e, se a resposta simulada pedir uma proibida, recebe recusa; o laço para em 6 rodadas; erro 5xx simulado não conta; pergunta 31 do Starter recebe 429; registro gravado com tokens e custo; `refusal` simulado vira a mensagem certa.
- **Homologação, com a chave real:** perguntas de cada perfil (dono, caixa, cozinha), uma de cada área do manual e uma tentativa de ver outro restaurante.

## 8. Fora do escopo (v1)
Ações pela IA; dados pessoais de clientes; voz; respostas em streaming na tela (a resposta chega inteira); migrar as outras funções que usam a Abacus.
