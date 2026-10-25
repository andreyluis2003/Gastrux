# Vídeos tutoriais (área no sistema) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Vídeos tutoriais" area inside Gastrux (list, per-video page, contextual "Vídeo desta tela", progress per user), fed by one catalog, ready for the videos the gastrux-videos pipeline produces.

**Architecture:** `lib/tutorials/catalog.ts` is the single source (pure, unit-tested); visibility per role reuses `lib/navigation/app-nav.ts` (`canSeeModule`). Progress is a new Prisma model `TutorialView` behind `GET/POST /api/tutorials/progress` (session user). UI: `/tutoriais`, `/tutoriais/[slug]`, a modal player opened from `AppShell`, and links in `FirstSteps`.

**Tech Stack:** Next.js 14 app router, React, Tailwind, Prisma/Postgres, next-auth, Jest (unit: `jest.unit.config.js`; integration: `jest.integration.config.js` + local DB on 55432).

**Spec:** `docs/superpowers/specs/2026-10-25-tutoriais-em-video-design.md`

## Global Constraints

- Video URL: `${process.env.NEXT_PUBLIC_TUTORIAL_VIDEO_BASE ?? '/videos/tutoriais'}/${slug}.mp4`, poster same base `${slug}.jpg`.
- Only `published: true` tutorials appear anywhere (no "em breve").
- A person only sees tutorials whose first route they can open (`canSeeModule(routes[0], role)`); `/dashboard` is visible to every role.
- UI copy in pt-BR; "Vídeos tutoriais" (menu/footer/page title), "Vídeo desta tela" (contextual button), "Comece por aqui" (track), "Abrir esta tela", "Próximo vídeo", "▶ Ver vídeo" (first steps).
- Watched = reached 90% of duration or `ended`.
- Every feature updates `lib/ai/knowledge/*.ts` and `lib/help/seed-articles.ts` (memory rule).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Slug in the URL that is not in the catalog or is unpublished → `/tutoriais/[slug]` shows Next's 404, not a broken player (Task 4 test on `tutorialBySlug`).
- POST progress with an unknown slug or no session → 400 / 401, nothing written (Task 2 tests).
- Same video watched twice → one row, `watchedAt` updated, no unique-constraint error (Task 2 test).
- A cook opening `/tutoriais` → no Financeiro/CRM videos (Task 1 `tutorialsFor('COOK')` test).
- Route matching for the contextual button: `/caixa/historico` → `caixa`, `/admin/tables/qrcodes` → `qr-codes-das-mesas` (not `cadastro-de-mesas`), `/dashboard/billing` must not match `conhecendo-o-painel` (Task 1 `tutorialForPath` tests).

---

### Task 1: Catalog

**Files:**
- Create: `lib/tutorials/catalog.ts`
- Test: `__tests__/unit/tutorials-catalog.test.ts`

**Interfaces:**
- Produces:
  - `type Tutorial = { slug: string; title: string; group: string; routes: string[]; summary: string; steps: string[]; durationSec: number; essentialOrder?: number; published: boolean }`
  - `TUTORIALS: Tutorial[]` — all 45 entries of the spec list (slug, title, group = nav group id from `NAV_GROUPS`, routes); `published: false` for all until videos exist; `steps`/`summary`/`durationSec` filled when a video is published (until then `steps: []`, `summary` one line, `durationSec: 0`).
  - `tutorialVideoUrl(slug: string): string`, `tutorialPosterUrl(slug: string): string`
  - `tutorialsFor(role: string | null | undefined): Tutorial[]` — published + visible for the role, catalog order
  - `essentialTrack(role): Tutorial[]` — of `tutorialsFor(role)`, those with `essentialOrder`, sorted by it
  - `tutorialForPath(pathname: string, role): Tutorial | null` — longest matching route among `tutorialsFor(role)`; `/dashboard` matches only exactly
  - `tutorialBySlug(slug: string): Tutorial | null` — published only
  - `nextTutorial(slug: string, role): Tutorial | null` — next in `essentialTrack` if the slug is in it, else next in `tutorialsFor` order

- [ ] **Step 1: Write the failing test** — with `published` forced via a helper: test file does `jest.mock` nothing; instead export `withPublished(slugs: string[]): Tutorial[]` is NOT added — tests set `TUTORIALS.forEach(t => (t.published = true))` in `beforeAll` (module array is mutable). Assertions:

```ts
expect(new Set(TUTORIALS.map((t) => t.slug)).size).toBe(TUTORIALS.length);
expect(TUTORIALS).toHaveLength(45);
for (const t of TUTORIALS) expect(NAV_GROUPS.some((g) => g.id === t.group)).toBe(true);
// every non-dashboard route is a menu link (or a sub-route of one)
expect(tutorialForPath('/caixa/historico', 'OWNER')?.slug).toBe('caixa');
expect(tutorialForPath('/admin/tables/qrcodes', 'OWNER')?.slug).toBe('qr-codes-das-mesas');
expect(tutorialForPath('/admin/tables', 'OWNER')?.slug).toBe('cadastro-de-mesas');
expect(tutorialForPath('/dashboard', 'COOK')?.slug).toBe('conhecendo-o-painel');
expect(tutorialForPath('/dashboard/billing', 'OWNER')?.slug).toBe('minha-assinatura');
expect(tutorialForPath('/dashboard/xyz', 'OWNER')).toBeNull();
expect(tutorialsFor('COOK').map((t) => t.slug)).not.toContain('financeiro');
expect(tutorialsFor('COOK').map((t) => t.slug)).toContain('cozinha-kds');
expect(essentialTrack('OWNER').map((t) => t.slug)).toEqual(['conhecendo-o-painel','insumos','fichas-tecnicas','cardapio-digital','cadastro-de-mesas','caixa','mesas-e-balcao','cozinha-kds','equipe-e-acessos']);
expect(tutorialVideoUrl('caixa')).toBe('/videos/tutoriais/caixa.mp4');
expect(nextTutorial('caixa', 'OWNER')?.slug).toBe('mesas-e-balcao');
// unpublished are invisible
TUTORIALS.find((t) => t.slug === 'dre')!.published = false;
expect(tutorialBySlug('dre')).toBeNull();
```

- [ ] **Step 2:** Run `npx jest --config jest.unit.config.js __tests__/unit/tutorials-catalog.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `lib/tutorials/catalog.ts`. Group ids: read `NAV_GROUPS` ids in `lib/navigation/app-nav.ts` and use them exactly. `/comanda` is an extra route of `mesas-e-balcao`.
- [ ] **Step 4:** Run the test — Expected: PASS.
- [ ] **Step 5:** Commit `feat(tutoriais): catalog of the tutorial videos`.

### Task 2: Progress (model, migration, API)

**Files:**
- Modify: `prisma/schema.prisma` (model `TutorialView` + relation on `User`)
- Create: `prisma/migrations/20261025160000_tutorial_views/migration.sql`
- Create: `app/api/tutorials/progress/route.ts`
- Test: `__tests__/integration/tutorials-progress.test.ts`

**Interfaces:**
- Consumes: `tutorialBySlug` (Task 1)
- Produces: `GET /api/tutorials/progress` → `{ watched: string[] }`; `POST /api/tutorials/progress` body `{ slug }` → `{ ok: true }`. Auth: `getServerSession(authOptions)`, user id from `session.user.id` (fallback by email, as `getRestaurantMember` does). No restaurant needed.
- Model: `TutorialView { id String @id @default(cuid()); userId String; slug String; watchedAt DateTime @default(now()); user User @relation(onDelete: Cascade) ; @@unique([userId, slug]); @@map("tutorial_views") }`

- [ ] **Step 1: Failing integration test** (pattern of `__tests__/integration/bad-day/new-operator-mistakes.test.ts`: `jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))`): no session → 401; unknown slug → 400 and no row; POST `caixa` twice → one row, second `watchedAt` ≥ first; GET returns `['caixa']`; another user's GET returns `[]`. Publish `caixa` in the test by mutating `TUTORIALS`.
- [ ] **Step 2:** `npm run test:db:start`, then `npx jest --config jest.integration.config.js --workerIdleMemoryLimit=10MB __tests__/integration/tutorials-progress.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Schema + migration SQL (create table, unique index, FK cascade), `npx prisma generate`, `npm run test:db:migrate`; implement the route with `upsert` on `userId_slug`.
- [ ] **Step 4:** Run the test — Expected: PASS.
- [ ] **Step 5:** Commit `feat(tutoriais): progress per user (TutorialView)`.

### Task 3: Player + modal + hook

**Files:**
- Create: `components/tutorials/tutorial-player.tsx`, `components/tutorials/tutorial-modal.tsx`, `hooks/use-tutorial-progress.ts`

**Interfaces:**
- Consumes: catalog URLs (Task 1), progress API (Task 2)
- Produces:
  - `useTutorialProgress(): { watched: Set<string>; markWatched(slug: string): void; loading: boolean }` (fetch GET once; POST fire-and-forget, optimistic)
  - `<TutorialPlayer tutorial={t} onWatched={() => void} autoPlay?: boolean />` — `<video controls playsInline preload="metadata" poster>`; calls `onWatched` once when `currentTime/duration ≥ 0.9` or `ended`
  - `<TutorialModal tutorial={t | null} onClose={() => void} />` — uses the existing `components/ui/dialog`; player + "Abrir a página do vídeo" link to `/tutoriais/[slug]`

- [ ] **Step 1:** Implement (UI only; logic is covered by Task 1/2 tests). `npx tsc --noEmit -p .` — Expected: no errors in these files.
- [ ] **Step 2:** Commit `feat(tutoriais): player, modal and progress hook`.

### Task 4: Pages `/tutoriais` and `/tutoriais/[slug]`

**Files:**
- Create: `app/tutoriais/page.tsx`, `app/tutoriais/[slug]/page.tsx`
- Modify: `middleware.ts` (`PUBLIC_ASSET`: allow `videos/tutoriais/[\w-]+\.(mp4|jpg)`), `__tests__/unit/middleware-public-pages.test.ts` (`/videos/tutoriais/caixa.mp4` opens; `/tutoriais` still requires login)

**Interfaces:**
- Consumes: `tutorialsFor`, `essentialTrack`, `tutorialBySlug`, `nextTutorial`, `NAV_GROUPS` labels, `useTutorialProgress`, `TutorialPlayer`
- `/tutoriais`: title "Vídeos tutoriais"; "Comece por aqui" with "N de M assistidos" and cards in order; then one section per nav group (group label from `NAV_GROUPS`), cards with poster, title, duration (m:ss), ✓ when watched; search input filters by title (accent-insensitive). Role from `useSession()` (same as AppShell).
- `/tutoriais/[slug]`: `notFound()` if `tutorialBySlug` is null; player; summary; "Passo a passo" numbered `steps`; buttons "Abrir esta tela" (`routes[0]`) and "Próximo vídeo" (`nextTutorial`).

- [ ] **Step 1:** Add the middleware test cases; run `npx jest --config jest.unit.config.js __tests__/unit/middleware-public-pages.test.ts` — Expected: FAIL on the tutorial video path.
- [ ] **Step 2:** Change the regex; rerun — Expected: PASS.
- [ ] **Step 3:** Build the two pages; `npx tsc --noEmit -p .` clean.
- [ ] **Step 4:** Commit `feat(tutoriais): video list and video page`.

### Task 5: Entry points (AppShell, FirstSteps)

**Files:**
- Modify: `components/app-shell/app-shell.tsx`, `components/dashboard/first-steps.tsx`

**Interfaces:**
- Consumes: `tutorialForPath`, `tutorialsFor`, `TutorialModal`
- AppShell: footer link "Vídeos tutoriais" (icon `PlayCircle`) to `/tutoriais`, above "Central de ajuda"; when `tutorialForPath(pathname, role)` is not null, a highlighted button "Vídeo desta tela" at the top of the sidebar nav (desktop) and an icon button in the mobile/drawer top bar; both open `TutorialModal`.
- FirstSteps: for each step, the tutorial whose `routes` contain the step `href` path (strip query/hash) → "▶ Ver vídeo" opening `TutorialModal`.

- [ ] **Step 1:** Implement; `npx tsc --noEmit -p .` clean; `npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts` still PASS.
- [ ] **Step 2:** Commit `feat(tutoriais): "Vídeo desta tela" and links in the menu and first steps`.

### Task 6: Help article + AI knowledge

**Files:**
- Modify: `lib/help/seed-articles.ts` (new article `videos-tutoriais` in `primeiros-passos`, featured), `lib/ai/knowledge/implantacao.ts` (paragraph: where the videos are, "Vídeo desta tela", the track)
- Test: existing `__tests__/unit/*help*` / knowledge tests

- [ ] **Step 1:** Add the article (new slug, so no legacy hash needed) and the knowledge paragraph; run `npx jest --config jest.unit.config.js` — Expected: all PASS.
- [ ] **Step 2:** Commit `docs(tutoriais): help article and AI knowledge`.

### Task 7: Verify in the browser + full suites

- [ ] Publish one tutorial locally with a placeholder MP4 (not committed) and check: list, video page, modal from "Vídeo desta tela", watched ✓ after the end, phone width 390 px.
- [ ] Full unit suite; integration suite (`--workerIdleMemoryLimit=10MB`).
- [ ] Final review (fresh reviewer), fix Critical/Important, then publish to main (memory: fast-forward main + release/consolidation; owner runs `npx prisma migrate deploy` and Deploy).
