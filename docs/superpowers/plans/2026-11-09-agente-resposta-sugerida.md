# Agente: resposta sugerida nas Conversas (etapa 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the team opens a conversation of the official number (0022) in Plataforma › Fila do agente › Conversas, the AI drafts the reply into the text box (or says "Responda você: <motivo>"); nothing is sent without a click, and every suggestion's outcome is recorded and summarised for 14 days.

**Architecture:** Pure rules (parse/validate the AI output, "quase igual", which client messages are pending, the prompt) live in `lib/agents/whatsapp/reply-rules.ts`. `lib/agents/whatsapp/suggest.ts` reads the conversation and the client's signals, calls the AI once per last client message, stores an `AgentReplySuggestion` row, settles it on send/discard, and computes stats. A separate route serves the suggestion so the conversation opens at once and the draft arrives after ("Preparando sugestão…").

**Tech Stack:** Next.js 14 route handlers, Prisma 6.7 (Postgres), Anthropic SDK via `getAnthropic()`, Jest (unit + integration configs), Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-09-agente-resposta-sugerida-design.md` (approved by the owner 2026-11-09).

## Global Constraints

- Never sends anything by itself: only the existing POST reply route sends.
- pt-BR, WhatsApp tone; reply text ≤ 700 characters (`WHATSAPP_MAX` from `lib/agents/activation/writer.ts`); at most one link, and only a `gastrux.com` link; no "Equipe Gastrux" signature.
- Never promises fix deadlines, discounts, extra trial days, cancellation or refunds; only facts from `KNOWLEDGE` (`lib/ai/knowledge/index.ts`), kept in fixed order (prompt cache).
- Team topics (no draft, "Responda você: <motivo>"): cobrança, pagamento, cancelamento, devolução de dinheiro, nota fiscal da assinatura; erro/defeito/"não funciona"; reclamação ou cliente irritado; dados pessoais, LGPD, apagar conta; dúvida fiscal/jurídica além do conhecimento; mensagem que não é texto (áudio, foto, documento).
- Non-client (no restaurant on the conversation): short pitch + `https://gastrux.com`, teste de 30 dias grátis, sem cartão.
- Context: last 20 messages (both sides, with date/time) + client signals + `KNOWLEDGE`.
- Model `aiModels().default`; switch by env `AI_MODEL_DEFAULT`, no code change.
- Only when the last message is the client's and the 24 h window is open. Several consecutive client messages → one reply covering all after the team's last reply.
- Invalid AI output or AI error → "Sem sugestão desta vez", conversation works as today. No `ANTHROPIC_API_KEY` → same, and nothing is stored.
- Platform screens only: no change to `lib/help/seed-articles.ts` or `lib/ai/knowledge`.
- Deploy: one migration; owner clicks Deploy, then `npx prisma migrate deploy` (homolog, then app).

## Review Focus

1. **The team already typed in the box when the suggestion (or a new client message) arrives** — the draft must never overwrite what a person typed. Test in Task 5 (`prefill only when the box is empty or still holds the previous draft`).
2. **The conversation is reopened, or the 15 s poll runs** — no second AI call for the same last client message. Test in Task 3 (`reopening returns the stored suggestion`).
3. **The team answers after "Nova sugestão" or after typing from scratch** — only the suggestion actually shown is settled; a reply with no suggestion id settles nothing. Test in Task 3 (`settle uses the given id only, and only if it belongs to this phone and is pending`).
4. **The AI answers with prose around the JSON, a second link, or a non-gastrux link** — rejected as "Sem sugestão desta vez", cost still recorded. Tests in Task 2.
5. **The team already replied after the client's last message** (last message is OUT) — no suggestion is requested. Test in Task 3.

---

### Task 1: Table `AgentReplySuggestion`

**Files:**
- Modify: `prisma/schema.prisma` (after `model AgentWhatsAppMessage`, ~line 5031)
- Create: `prisma/migrations/20261109120000_agent_reply_suggestions/migration.sql`

**Interfaces:**
- Produces: `prisma.agentReplySuggestion` with fields `id String @id @default(cuid())`, `phone String` (phoneKey), `forMessageId String` (id of the last IN `AgentWhatsAppMessage`), `forMessageAt DateTime` (its createdAt, for expiry), `kind String` (`SUGGESTION` | `TEAM` | `FAILED`), `text String?`, `reason String?`, `model String?`, `costUsd Float @default(0)`, `outcome String @default("pending")` (`pending` | `sent_as_is` | `sent_edited` | `discarded` | `expired` | `team` | `failed`), `sentMessageId String?`, `decidedBy String?`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`; `@@index([phone, createdAt])`, `@@index([createdAt])`, `@@map("agent_reply_suggestions")`. No relations (same style as `AgentWhatsAppMessage`).

- [ ] **Step 1:** Add the model with a `///` doc line per non-obvious field (as in `AgentWhatsAppMessage`).
- [ ] **Step 2:** Write the migration SQL (CreateTable + the two indexes) in the style of `20261108120000_coupons`. Run `npx prisma validate` → "The schema ... is valid"; `npx prisma generate` succeeds.
- [ ] **Step 3:** Apply to the test DB: `npm run test:db:migrate` → the new migration is listed as applied.
- [ ] **Step 4:** Commit `feat(agente): table for suggested replies`.

### Task 2: Pure rules — `reply-rules.ts`

**Files:**
- Create: `lib/agents/whatsapp/reply-rules.ts`
- Test: `__tests__/unit/agent-reply-rules.test.ts`

**Interfaces:**
- Consumes: `WHATSAPP_MAX` from `lib/agents/activation/writer.ts`; `ActivationSignals` type from `lib/agents/activation/rules.ts`.
- Produces:
  - `type ReplyMessage = { id: string; direction: 'IN' | 'OUT'; text: string; messageType: string; createdAt: Date }`
  - `pendingClientMessages(messages: ReplyMessage[]): ReplyMessage[]` — messages oldest-first in; returns the IN messages after the last OUT (empty if the last message is OUT).
  - `nonTextReason(pending: ReplyMessage[]): string | null` — `'Mensagem com áudio, foto ou documento'` when any pending message has `messageType` not in `text`, `button`, `interactive`; else null.
  - `type ParsedReply = { kind: 'SUGGESTION'; text: string } | { kind: 'TEAM'; reason: string } | null`
  - `parseReply(raw: string): ParsedReply` — expects the JSON `{"tipo":"sugestao","texto":"..."}` or `{"tipo":"equipe","motivo":"..."}`; tolerates a ```json fence; returns null for anything else.
  - `validReplyText(text: string): boolean` — non-empty after trim, ≤ `WHATSAPP_MAX`, ≤ 1 `https?://` link, every link's host is `gastrux.com` or `*.gastrux.com`, does not end with `Equipe Gastrux`.
  - `sameEnough(suggested: string, sent: string): boolean` — the "quase igual" criterion: equal after trim + collapsing whitespace + lowercasing, or Levenshtein distance of those normalised strings ≤ 10. Write the criterion in a doc comment.
  - `type ClientContext = { kind: 'client'; signals: ActivationSignals; tier: string } | { kind: 'visitor' }`
  - `replySystemPrompt(knowledge: string): string` and `replyUserPrompt(ctx: ClientContext, last20: ReplyMessage[], now: Date): string`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('pendingClientMessages', () => {
  it('returns the IN messages after the last OUT', () => {
    const m = [msg('IN','oi'), msg('OUT','olá'), msg('IN','quanto custa?'), msg('IN','o Pro')];
    expect(pendingClientMessages(m).map(x => x.text)).toEqual(['quanto custa?', 'o Pro']);
  });
  it('is empty when the last message is the team\'s', () => {
    expect(pendingClientMessages([msg('IN','oi'), msg('OUT','olá')])).toEqual([]);
  });
});
it('nonTextReason: audio/image/document go to the team', () => {
  expect(nonTextReason([msg('IN','[audio]','audio')])).toBe('Mensagem com áudio, foto ou documento');
  expect(nonTextReason([msg('IN','Sim','button')])).toBeNull();
});
describe('parseReply', () => {
  it('suggestion', () => expect(parseReply('{"tipo":"sugestao","texto":"O Pro custa..."}')).toEqual({ kind: 'SUGGESTION', text: 'O Pro custa...' }));
  it('team', () => expect(parseReply('```json\n{"tipo":"equipe","motivo":"Pedido de cancelamento"}\n```')).toEqual({ kind: 'TEAM', reason: 'Pedido de cancelamento' }));
  it('prose or wrong shape → null', () => {
    expect(parseReply('Claro! Aqui vai: oi')).toBeNull();
    expect(parseReply('{"tipo":"sugestao"}')).toBeNull();
  });
});
describe('validReplyText', () => {
  it('accepts one gastrux link', () => expect(validReplyText('Cadastre em https://gastrux.com')).toBe(true));
  it('rejects >700, two links, other hosts, signature', () => {
    expect(validReplyText('a'.repeat(701))).toBe(false);
    expect(validReplyText('https://gastrux.com e https://gastrux.com/pricing')).toBe(false);
    expect(validReplyText('veja https://outro.com')).toBe(false);
    expect(validReplyText('Oi!\n\nEquipe Gastrux')).toBe(false);
  });
});
describe('sameEnough', () => {
  it('spaces/case only, or a corrected name, is the same', () => {
    expect(sameEnough('Oi, Maria!  O Pro custa R$ 99.', 'oi, maria! o pro custa r$ 99.')).toBe(true);
    expect(sameEnough('Oi, Maria! O Pro custa R$ 99.', 'Oi, Mariana! O Pro custa R$ 99.')).toBe(true);
  });
  it('a rewritten sentence is an edit', () => expect(sameEnough('O Pro custa R$ 99 por mês.', 'Te mando os planos agora, um momento.')).toBe(false));
});
describe('replyUserPrompt', () => {
  it('client: names, stage, plan, steps, next step, transcript with dates', () => { /* expect restaurant name, owner first name, 'Passos feitos: 1 de', next step label, 'Plano: business', '09/11' */ });
  it('visitor: says there is no account and to pitch https://gastrux.com, 30 dias grátis, sem cartão', () => { /* expect those three strings */ });
});
it('replySystemPrompt holds every rule and the knowledge at the end', () => {
  const s = replySystemPrompt('KNOW');
  for (const t of ['700', 'gastrux.com', 'Equipe Gastrux', 'desconto', 'cancelamento', 'LGPD', '"tipo":"equipe"', '"tipo":"sugestao"']) expect(s).toContain(t);
  expect(s.trim().endsWith('KNOW')).toBe(true);
});
```

(`msg(direction, text, messageType = 'text')` builds a `ReplyMessage` with increasing dates. Reuse the `signals` fixture shape from `__tests__/unit/activation-writer.test.ts`.)

- [ ] **Step 2:** Run `npx jest --config jest.unit.config.js __tests__/unit/agent-reply-rules.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement the functions above. The system prompt states the Global Constraints rules and the team-topic list, says the number is the official Gastrux WhatsApp, emojis only if the client used them, "se não souber, responda tipo equipe com o motivo", and "responda só com o JSON"; it ends with `'Conhecimento do produto:\n' + knowledge`. The user prompt: client context (owner first name, restaurant, business type via `SEGMENTS` like the writer, days since sign-up, stage, plan tier, `Passos feitos: X de Y`, next undone step label) or the visitor line; then `Conversa (mais antiga primeiro):` with `[dd/MM HH:mm] Cliente|Equipe: text` lines in America/Sao_Paulo.
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Commit `feat(agente): rules for suggested replies`.

### Task 3: Suggest, settle, stats — `suggest.ts`

**Files:**
- Create: `lib/agents/whatsapp/suggest.ts`
- Modify: `lib/agents/whatsapp/conversation.ts` (export `WINDOW_MS`)
- Test: `__tests__/integration/agents/agent-reply-suggestion.test.ts` (mock `lib/ai/client` like `activation-writer.test.ts`; DB setup like `agent-whatsapp.test.ts`)

**Interfaces:**
- Consumes: Task 1 model; Task 2 functions; `loadActivationSignals(restaurantId, now)`; `restaurantTier(restaurantId)` from `lib/tier-guard`; `getAnthropic()`; `aiModels()`, `estimateCostUsd()`; `KNOWLEDGE`; `phoneKey`.
- Produces:
  - `type SuggestionView = { state: 'none' } | { state: 'unavailable' } | { state: 'ready'; id: string; kind: 'SUGGESTION' | 'TEAM' | 'FAILED'; text: string | null; reason: string | null }`
  - `getOrCreateSuggestion(phone: string, opts?: { regenerate?: boolean; by?: string; now?: Date }): Promise<SuggestionView>`
  - `discardSuggestion(phone: string, id: string, by: string): Promise<void>`
  - `settleSuggestion(phone: string, id: string | undefined, sentText: string, sentMessageId: string, by: string): Promise<void>`
  - `suggestionStats(now?: Date): Promise<{ made: number; asIs: number; edited: number; discarded: number; team: number }>` (last 14 days by `createdAt`; `made` counts kind SUGGESTION)

Behaviour:
- `getOrCreateSuggestion`: load the last 20 messages of `phoneKey(phone)`; if the last is not IN, or the window (`WINDOW_MS` from the last IN) is closed → `{state:'none'}`. If there is a stored row for that last IN id and not `regenerate` → return it as `ready`; with `regenerate`, mark the previous `pending` SUGGESTION rows for that IN message `discarded` (decidedBy = by) and generate again. Non-text pending → store a TEAM row (`reason` = `nonTextReason`, outcome `team`, cost 0) without calling the AI. No AI client → `{state:'unavailable'}`, nothing stored. Otherwise call `messages.create({ model, max_tokens: 700, system: [{ type: 'text', text: replySystemPrompt(KNOWLEDGE), cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: replyUserPrompt(...) }] })`; context = client when any of those messages has a `restaurantId` and `loadActivationSignals` returns signals, else visitor. Store SUGGESTION (outcome `pending`) / TEAM (outcome `team`) / FAILED (outcome `failed`, when `parseReply` is null or `validReplyText` fails, or the call throws — cost from usage when there is one). Each row stores `model` and `costUsd`.
- `settleSuggestion`: only when `id` is given, the row has this phone, kind SUGGESTION and outcome `pending`: outcome `sent_as_is` if `sameEnough(text, sentText)` else `sent_edited`; set `sentMessageId`, `decidedBy`.
- `discardSuggestion`: same ownership/pending check → `discarded`.
- `suggestionStats`: first `updateMany` pending SUGGESTION rows with `forMessageAt` older than `WINDOW_MS` → `expired`; then count.

- [ ] **Step 1: Write the failing tests** (names and assertions):
  - `opening a conversation whose last message is the client's stores one suggestion` — inbound "quanto custa o Pro?", AI mock returns `{"tipo":"sugestao","texto":"O Pro custa R$ 99 por mês."}` → `state:'ready'`, kind SUGGESTION, text as given, `costUsd > 0`, one row.
  - `reopening returns the stored suggestion` — second call → same id, AI `create` called once.
  - `a new client message gets a new suggestion` — another inbound → different id, AI called twice.
  - `several client messages in a row → one call that sees all of them` — the user prompt passed to `create` contains both texts.
  - `regenerate discards the previous one and asks again` — previous row outcome `discarded`.
  - `last message from the team → none` and `window closed (last IN 25 h ago) → none`, AI not called.
  - `a team topic comes back as TEAM` — AI returns `{"tipo":"equipe","motivo":"Pedido de cancelamento"}` → kind TEAM, reason, outcome `team`.
  - `audio goes to the team without calling the AI` — inbound type `audio` → kind TEAM, AI not called.
  - `invalid output is FAILED with its cost` — AI returns two links → kind FAILED, `costUsd > 0`.
  - `without ANTHROPIC_API_KEY → unavailable, nothing stored` — `getAnthropic` returns null.
  - `visitor context` — number with no account → prompt contains `https://gastrux.com`.
  - `settle uses the given id only, and only if it belongs to this phone and is pending` — settle with the right id and same text → `sent_as_is`; with an edited text → `sent_edited`; without id → no row changes; with another phone's id → unchanged.
  - `stats: 14 days, expires stale pending` — rows seeded with outcomes + one pending with `forMessageAt` 25 h ago → that one becomes `expired`; counts match.
- [ ] **Step 2:** Run `npx jest --config jest.integration.config.js __tests__/integration/agents/agent-reply-suggestion.test.ts --workerIdleMemoryLimit=10MB` → FAIL.
- [ ] **Step 3:** Implement `suggest.ts` as specified.
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Commit `feat(agente): suggest a reply for the official number's conversations`.

### Task 4: Routes

**Files:**
- Create: `app/api/admin/agent-conversations/[phone]/suggestion/route.ts`
- Modify: `app/api/admin/agent-conversations/[phone]/route.ts` (POST)
- Modify: `app/api/admin/agent-conversations/route.ts` (GET)
- Test: add to `__tests__/integration/agents/agent-reply-suggestion.test.ts`

**Interfaces:**
- Consumes: Task 3 functions; `requirePlatformAdmin()`.
- Produces:
  - `GET /api/admin/agent-conversations/[phone]/suggestion` → `SuggestionView` (platform team only, `Cache-Control: private, no-store`).
  - `POST /api/admin/agent-conversations/[phone]/suggestion` body `{ action: 'regenerate' }` → `SuggestionView`; `{ action: 'discard', id }` → `{ ok: true }`; anything else → 400.
  - Existing reply POST accepts optional `suggestionId: string` and, after a successful `reply()`, calls `settleSuggestion(phone, suggestionId, text, message.id, sentBy)` (a settle error is logged, never fails the send).
  - Conversations GET adds `suggestionStats` (Task 3 shape) to its JSON.

- [ ] **Step 1: Failing tests:** `non-admin gets 401/403 on the suggestion route`; `GET suggestion then answer with suggestionId marks sent_as_is`; `discard via POST marks discarded`; `list GET returns suggestionStats`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run the whole file plus `__tests__/integration/agents/agent-whatsapp.test.ts` → PASS (existing reply behaviour unchanged).
- [ ] **Step 5:** Commit `feat(agente): routes for suggested replies`.

### Task 5: Conversas screen

**Files:**
- Modify: `components/admin/agent-conversations.tsx`
- Modify: `app/admin/agente/page.tsx` (keep `out.suggestionStats` from the conversations GET and pass it to `AgentConversations`)
- Create: `lib/agents/whatsapp/draft-box.ts` (pure helper) + Test: `__tests__/unit/agent-draft-box.test.ts`

**Interfaces:**
- Consumes: Task 4 routes and shapes.
- Produces: `shouldPrefill(box: string, previousDraft: string | null): boolean` — true when `box.trim()` is empty or `box === previousDraft`.

Behaviour (`Thread`):
- After `load()`, when the window is open and the last message is IN, and its id differs from the last one a suggestion was requested for, GET the suggestion route; meanwhile show "Preparando sugestão…" under the box.
- `SUGGESTION`: if `shouldPrefill(text, lastDraft)`, put the text in the box; show a badge "Sugestão do agente" above the box and buttons **Nova sugestão** (POST regenerate, same prefill rule) and **Descartar** (POST discard, clears the box only if `shouldPrefill`, hides the badge).
- `TEAM`: amber line "Responda você: <reason>", box untouched.
- `FAILED` / `unavailable`: muted line "Sem sugestão desta vez" with **Nova sugestão** (only for FAILED).
- `none`: nothing.
- **Responder** sends `suggestionId` when a SUGGESTION is showing; afterwards clear the suggestion state.

`AgentConversations` gets an optional `stats` prop; above the list, one muted line: `Últimos 14 dias: X sugestões · Y% enviadas sem mudança · Z% com edição · W% descartadas · N para a equipe` (percentages of `made`, rounded; hidden when `made + team === 0`).

- [ ] **Step 1: Failing unit test** `shouldPrefill`: empty → true; whitespace → true; equals previous draft → true; typed text → false; previous draft null and typed → false.
- [ ] **Step 2:** Run `npx jest --config jest.unit.config.js __tests__/unit/agent-draft-box.test.ts` → FAIL. **Step 3:** Implement the helper and the UI. **Step 4:** Unit test PASS; `npx tsc --noEmit -p .` clean.
- [ ] **Step 5:** Visual check: run the app locally (skill `run`) with a seeded conversation and the AI mocked or a real key; screenshot the thread with the badge, a TEAM line, and the stats line at 380 px and desktop widths.
- [ ] **Step 6:** Commit `feat(agente): suggested reply in Conversas`.

### Task 6: Cost in "Custo da IA"

Today `lib/admin/ai-costs.ts` sums only `aiQuestion`; the activation agent's `AgentAction.costUsd` is not shown either (the spec assumed it was). Both agents go in.

**Files:**
- Modify: `lib/admin/ai-costs.ts`, `app/admin/platform/ia/page.tsx`
- Test: extend the existing ai-costs integration test if present (`grep -rl aiCostsByMonth __tests__`), else add `__tests__/integration/admin/ai-costs-agents.test.ts`

**Interfaces:**
- Produces: `aiCostsByMonth(ym)` also returns `agents: { activationUsd: number; repliesUsd: number }` (sums of `AgentAction.costUsd` and `AgentReplySuggestion.costUsd` in the same Brasília month range), and `totals.costUsd` includes both.

- [ ] **Step 1: Failing test** `agent costs are in the month total` — seed one AgentAction (costUsd 0.01) and one suggestion (0.002) this month → `agents` matches and `totals.costUsd` grows by 0.012.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; on the page, under "Custo no mês", a small line `Agentes: ativação US$ x · respostas US$ y`. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(ia): agent costs in Custo da IA`.

### Task 7: Full check, publish, manual

- [ ] **Step 1:** `npx jest --config jest.unit.config.js` and `npx jest --config jest.integration.config.js --workerIdleMemoryLimit=10MB` → all PASS; `npx tsc --noEmit -p .` clean.
- [ ] **Step 2:** Push to `main` with `GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes"`. Tell the owner: Deploy, then `npx prisma migrate deploy` (homolog, then app).
- [ ] **Step 3:** Manual (Claude Doc e47fd4d1-0a3f-4e2b-a96d-86475da2833e): one paragraph under the official number section — the suggestion, Responda você, Nova sugestão/Descartar, the 14-day line, cost in Custo da IA, model switch by `AI_MODEL_DEFAULT`.
- [ ] **Step 4:** Real test with the owner: from another phone, "quanto custa o plano Pro?" (expect a draft) and "quero cancelar" (expect "Responda você").
- [ ] **Step 5:** Update memory (`project_gastrux-backlog.md`) with commits and status.
