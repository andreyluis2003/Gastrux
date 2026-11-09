# Foto do produto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner or a manager puts one photo on each menu product (phone camera/gallery or computer), stored in S3-compatible storage, shown where `images[0]` is already shown.

**Architecture:** `lib/storage/photos.ts` wraps `@aws-sdk/client-s3` (config from env, key/URL building, put/delete, image sniffing). A route per product (`/api/cardapio/itens/[id]/foto`) receives the already-resized JPEG and swaps the product's single `MenuItemImage`. A browser helper resizes to 1200 px JPEG before upload; a `ProductPhotoField` component is used in the new-product form and the edit dialog of `app/admin/cardapio/page.tsx`.

**Tech Stack:** Next.js 14 route handlers (`multipart/form-data` via `req.formData()`), Prisma, `@aws-sdk/client-s3` (already a dependency), canvas in the browser, Jest.

**Spec:** `docs/superpowers/specs/2026-11-09-foto-do-produto-design.md` (approved by the owner 2026-11-09).

## Global Constraints

- One photo per product; uploading replaces the previous one. Products only (no insumos).
- Browser resize: longest side ≤ 1200 px, JPEG, quality 0.8. Accepts what the browser can open (JPEG, PNG, WebP, HEIC on Safari).
- Server accepts only `image/jpeg`, `image/png`, `image/webp`, checked by the first bytes, max **2 MB**.
- Permission: `requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente')`; the product must belong to `getCurrentRestaurantId()`. All plans.
- Env: `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION` (R2: `auto`), `STORAGE_S3_BUCKET`, `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY`, `STORAGE_PUBLIC_URL`, `STORAGE_PREFIX` (`app` / `homolog`). Missing any (prefix optional, default `app`) → uploads disabled.
- Key: `<prefixo>/restaurants/<restaurantId>/menu/<menuItemId>/<id aleatório>.jpg`; `cloudStoragePath` = key, `imageUrl` = `STORAGE_PUBLIC_URL` + `/` + key.
- Replace/remove/delete product → delete the old file; a failed file delete is only logged. Imported photos (`cloudStoragePath` empty) have no file to delete.
- Copy (pt-BR, exact): "Foto", "Escolher foto", "Remover", "Enviando…", "Não deu para abrir esta foto. Tente uma foto em JPG ou PNG.", "Não foi possível salvar a foto. Tente de novo.", "Envio de fotos ainda não está disponível".
- No migration (`MenuItemImage` already has `imageUrl` and `cloudStoragePath`). `next.config` has `images: { unoptimized: true }`: no domain config.
- Every client-facing feature updates `lib/ai/knowledge/cardapio.ts` and `lib/help/seed-articles.ts` (new article; old content hash rule of that file).

## Review Focus

1. **A photo bigger than 2 MB after resize, or a file the browser can't decode** — friendly message, product unchanged. Tests: Task 2 (`413 over 2 MB`), Task 3 (`resize rejects undecodable`).
2. **Uploading a photo to a product of another restaurant** (id guessing) — 404, nothing stored. Test in Task 2.
3. **A product that already has two or more image rows** (imports can create one each; old data) — upload leaves exactly one row and deletes all old files that have a path. Test in Task 2.
4. **Storage down after the file was written but before the DB row** — no orphan row pointing nowhere; the new file is deleted best-effort. Test in Task 2.
5. **Creating a new product with a photo when the photo upload fails** — the product stays created, the toast says the photo failed, and the edit dialog can retry. Covered by Task 4's flow and the owner's real test.

---

### Task 1: Storage helper

**Files:**
- Create: `lib/storage/photos.ts`
- Test: `__tests__/unit/storage-photos.test.ts` (mock `@aws-sdk/client-s3`: `S3Client` with a `send` jest.fn, commands as plain constructors capturing input)

**Interfaces:**
- Produces:
  - `MAX_PHOTO_BYTES = 2 * 1024 * 1024`
  - `type StorageConfig = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; publicUrl: string; prefix: string }`
  - `storageConfig(env?: NodeJS.ProcessEnv): StorageConfig | null` — null when any required var is missing/blank; `publicUrl` without trailing `/`; `prefix` default `app`.
  - `sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null` — JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`.
  - `menuPhotoKey(cfg: StorageConfig, restaurantId: string, menuItemId: string, randomId: string, ext: 'jpg' | 'png' | 'webp'): string`
  - `publicUrlFor(cfg: StorageConfig, key: string): string`
  - `putPhoto(cfg: StorageConfig, key: string, bytes: Uint8Array, contentType: string): Promise<void>` — `PutObjectCommand` with `CacheControl: 'public, max-age=31536000, immutable'`.
  - `deletePhoto(cfg: StorageConfig, key: string): Promise<void>` — `DeleteObjectCommand`; never throws (logs `[storage] delete failed:`).
  - The client: `new S3Client({ region, endpoint, credentials, forcePathStyle: true })`, created per config (cache one instance per endpoint+key id).

- [ ] **Step 1: Failing tests:** `storageConfig` null when one var is missing, trims the trailing slash, prefix default `app`; `sniffImageType` for the three signatures, a GIF (`47 49 46 38`) and text → null; `menuPhotoKey(cfg('homolog'), 'r1', 'm1', 'abc', 'jpg') === 'homolog/restaurants/r1/menu/m1/abc.jpg'`; `publicUrlFor` joins with one `/`; `putPhoto` sends `Bucket`, `Key`, `ContentType`, `CacheControl`; `deletePhoto` resolves even when `send` rejects.
- [ ] **Step 2:** `npx jest --config jest.unit.config.js __tests__/unit/storage-photos.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS. `npx tsc --noEmit -p .` clean.
- [ ] **Step 5:** Commit `feat(cardapio): storage helper for product photos`.

### Task 2: Photo routes + product delete

**Files:**
- Create: `app/api/cardapio/itens/[id]/foto/route.ts`, `app/api/cardapio/fotos/route.ts`, `lib/cardapio/product-photo.ts`
- Modify: `app/api/cardapio/itens/[id]/route.ts` (DELETE: after the soft delete, remove the product's photo)
- Test: `__tests__/integration/cardapio/product-photo.test.ts` (pattern: `__tests__/integration/cardapio/cardapio-rapido.test.ts` — mock `next-auth` and `lib/whatsapp/get-restaurant`; mock `lib/storage/photos` keeping `sniffImageType`, `menuPhotoKey`, `publicUrlFor`, `MAX_PHOTO_BYTES` real and `storageConfig`/`putPhoto`/`deletePhoto` as jest.fn)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `setProductPhoto(restaurantId: string, menuItemId: string, bytes: Uint8Array): Promise<{ id: string; imageUrl: string }>` and `removeProductPhoto(restaurantId: string, menuItemId: string): Promise<void>` in `lib/cardapio/product-photo.ts`. Both throw `PhotoError` (`code: 'disabled' | 'not_found' | 'bad_type' | 'too_big' | 'storage'`).
  - `POST /api/cardapio/itens/[id]/foto` (`multipart/form-data`, field `foto`) → 200 `{ id, imageUrl }`; 400 `{ error: 'Não deu para abrir esta foto. Tente uma foto em JPG ou PNG.' }` (no file / bad type); 413 `{ error: 'A foto ficou grande demais. Tente outra foto.' }` (copy not in the spec — plan's choice); 404 product not found; 503 `{ error: 'Envio de fotos ainda não está disponível' }`; 502 `{ error: 'Não foi possível salvar a foto. Tente de novo.' }`.
  - `DELETE /api/cardapio/itens/[id]/foto` → 200 `{ ok: true }` (also when there was no photo).
  - `GET /api/cardapio/fotos` → `{ enabled: boolean }` (any signed-in member of the restaurant).

Behaviour of `setProductPhoto`: config null → `disabled`; product not in restaurant → `not_found`; `sniffImageType` null → `bad_type`; `> MAX_PHOTO_BYTES` → `too_big`; random id `crypto.randomUUID()`; `putPhoto`; then in one transaction delete all existing `MenuItemImage` rows of the product and create the new one; after commit, `deletePhoto` every old row's non-empty `cloudStoragePath`. If the transaction fails after `putPhoto`, `deletePhoto` the new key and throw `storage`. `putPhoto` failure → `storage`.

- [ ] **Step 1: Failing tests:**
  - `owner uploads a JPEG → one image row with the public URL and the key path; putPhoto called with image/jpeg`
  - `replacing deletes all old rows and their files (two old rows, one with empty path → deletePhoto called once)`
  - `remove deletes the row and the file; remove without photo → ok`
  - `another restaurant's product → 404, putPhoto not called`
  - `cook (non-manager) → 403`
  - `GIF bytes → 400 with the copy`; `2 MB + 1 byte JPEG → 413`
  - `storage not configured → 503 and GET /api/cardapio/fotos → { enabled: false }`
  - `putPhoto rejects → 502, no row`
  - `DB failure after put (mock prisma $transaction to reject once) → 502 and deletePhoto(newKey)`
  - `deleting the product removes its photo row and file`
- [ ] **Step 2:** `npx jest --config jest.integration.config.js __tests__/integration/cardapio/product-photo.test.ts --workerIdleMemoryLimit=10MB` → FAIL.
- [ ] **Step 3:** Implement (routes use the same session/role/restaurant pattern as `app/api/cardapio/itens/[id]/route.ts`; `export const dynamic = 'force-dynamic'`).
- [ ] **Step 4:** Same command → PASS; also run `__tests__/integration/cardapio/cardapio-rapido.test.ts` → PASS. tsc clean.
- [ ] **Step 5:** Commit `feat(cardapio): upload, replace and remove the product photo`.

### Task 3: Browser resize helper

**Files:**
- Create: `lib/cardapio/photo-resize.ts`
- Test: `__tests__/unit/photo-resize.test.ts`

**Interfaces:**
- Produces:
  - `PHOTO_MAX_SIDE = 1200`, `PHOTO_QUALITY = 0.8`
  - `targetSize(width: number, height: number, maxSide?: number): { width: number; height: number }` — scales down keeping the ratio (rounded), never up.
  - `resizePhoto(file: File): Promise<Blob>` — `createImageBitmap(file)` (fallback: `<img>` + object URL), draw on a canvas at `targetSize`, white background (PNG transparency → white), `canvas.toBlob(..., 'image/jpeg', PHOTO_QUALITY)`; rejects with `PhotoDecodeError` when the image can't be decoded.

- [ ] **Step 1: Failing tests:** `targetSize(4000, 3000) → {1200, 900}`; `targetSize(3000, 4000) → {900, 1200}`; `targetSize(800, 600) → {800, 600}`; `targetSize(1201, 1) → {1200, 1}` (minimum 1 px); `resizePhoto` rejects with `PhotoDecodeError` when `createImageBitmap` rejects and the `<img>` fallback errors (stub both on `global`).
- [ ] **Step 2:** `npx jest --config jest.unit.config.js __tests__/unit/photo-resize.test.ts` → FAIL. **Step 3:** Implement. **Step 4:** PASS; tsc clean.
- [ ] **Step 5:** Commit `feat(cardapio): resize product photos in the browser`.

### Task 4: Photo field in the product form

**Files:**
- Create: `components/cardapio/product-photo-field.tsx`
- Modify: `app/admin/cardapio/page.tsx` (new-product form in the category card; "Editar Item" dialog)

**Interfaces:**
- Consumes: Task 2 routes, Task 3 `resizePhoto` / `PhotoDecodeError`.
- Produces: `ProductPhotoField` props `{ enabled: boolean; imageUrl: string | null; menuItemId?: string; onChange?: (imageUrl: string | null) => void; onPick?: (blob: Blob | null) => void }` — with `menuItemId` it uploads/removes at once; without it (new product) it only previews and hands the resized blob to `onPick`.

Behaviour:
- A square preview (current photo, else a camera icon) titled "Foto", button "Escolher foto" (hidden `<input type="file" accept="image/*">`, no `capture`), "Remover" when there is a photo; while sending, "Enviando…" over the preview and buttons disabled.
- Decode failure → toast "Não deu para abrir esta foto. Tente uma foto em JPG ou PNG."; server error → toast with the route's `error`.
- `enabled` false → only the line "Envio de fotos ainda não está disponível" (and the existing photo, if any, still shows).
- Page: fetch `GET /api/cardapio/fotos` once; edit dialog uses `menuItemId = editingItem.id`, `onChange` updates the item in the list (or refetches categories); new-product form keeps the picked blob and, after `POST /api/cardapio/itens` returns the item, uploads it to `/api/cardapio/itens/<id>/foto`; if that upload fails, toast "Item criado, mas a foto não foi salva. Abra o item e tente de novo." and keep the product.
- Layout fits the 380 px phone width (the form is used on phones).

- [ ] **Step 1:** Implement the component and wire it in.
- [ ] **Step 2:** `npx tsc --noEmit -p .` clean; `npx jest --config jest.unit.config.js __tests__/unit/photo-resize.test.ts` still PASS.
- [ ] **Step 3:** Commit `feat(cardapio): photo field in the product form`.

### Task 5: Help and AI knowledge

**Files:**
- Modify: `lib/ai/knowledge/cardapio.ts`, `lib/help/seed-articles.ts`

- [ ] **Step 1:** Knowledge: replace "Categorias, itens, preços, fotos e o que aparece…" so it states the truth, and add a line: "Foto do produto (dono e gerente; todos os planos): no criar ou editar produto, área Foto, botão Escolher foto (no celular abre a câmera ou a galeria) e Remover. Uma foto por produto; o Gastrux diminui a foto antes de enviar. Aparece no cardápio do QR Code, no site de delivery e na lista do cardápio. Insumos não têm foto. Foto trazida pelo Importar de um link continua no endereço original até ser trocada." Keep the knowledge file order unchanged.
- [ ] **Step 2:** Help: new article in `cardapio-e-receitas`, slug `foto-do-produto`, title "Como coloco foto nos produtos?", keywords include `foto, imagem, câmera, galeria, cardápio digital, qr code`, content with the steps above and "Se aparecer 'Envio de fotos ainda não está disponível', o envio ainda não foi ligado na sua conta: fale com o suporte." Follow the file's rule for content hashes (new article: no legacy hash needed; if you edit an existing article's content, add its previous hash to `LEGACY_DEFAULT_HASHES`).
- [ ] **Step 3:** Run the help/knowledge unit tests that exist (`npx jest --config jest.unit.config.js -t "help|knowledge"` or the files under `__tests__/unit` matching `help`/`knowledge`) → PASS.
- [ ] **Step 4:** Commit `docs(ajuda): foto do produto`.

### Task 6: Full check and publish (controller)

- [ ] Unit suite + tsc; integration for `__tests__/integration/cardapio` (memory is tight: run the folder, not the whole suite, unless memory allows).
- [ ] Fast-forward `main`, push with the deploy key. No migration. Tell the owner: the code shows "Envio de fotos ainda não está disponível" until the storage account exists; then the env vars (homolog `STORAGE_PREFIX=homolog`, app `app`) and Deploy.
- [ ] Manual (Claude Doc): storage paragraph (service, env vars, prefix per environment). Memory update.
