# Keeta orders (delivery platforms part 3, design, 2026-11-13)

Continues `2026-10-23-delivery-plataformas-design.md` and follows the 99Food design (`2026-11-09-99food-design.md`,
plan `docs/superpowers/plans/2026-11-09-99food.md`) and the iFood design (`2026-10-24-ifood-design.md`). Decisions
marked **(our call)** are Claude's where the Keeta docs are silent or ambiguous; the owner can change them.
User-facing strings are pt-BR; everything else is English.

## Sources

- Local OpenAPI `docs/keeta/opendelivery.json` (Keeta Open Delivery API; the file's guide sections and changelog go up
  to **v1.0.9, 2026-01-06**, the same as the live changelog). The guide pages are embedded in that file as tag
  descriptions, so they were read in full from it. Base URL: `https://open.mykeeta.com/api/open/opendelivery`.
- Live pages checked (server-rendered, same text as the json): `https://api-docs.mykeeta.com/apis/opendelivery/changelog`,
  `.../orderspolling`. Short links below are relative to `https://api-docs.mykeeta.com/apis/opendelivery/`.
- **404 on the live site:** `section/authenticate`, `section/configure-store-mapping-and-webhooks`,
  `section/place-a-test-order`, `section/order-workflow-testing`. Their content is in the "Integrating with Keeta API"
  guide (`integrating-with-keeta-api`), which was read.
- **Not in the public docs:** the SOW file and the SIT test-case file (downloaded from the Dev Portal, with login).
- Keeta Dev Portal, seen by the owner on 2026-11-13: "Adicionar novo aplicativo" (Nome, IP whitelist, Tipo de
  aplicativo, webhooks per event code for Loja de teste / Loja real), tools Validação de mapeamento, Loja de teste,
  Simulador de entrega, Ferramenta de pedido teste, Pesquisa de logs, Tickets.

## What already exists in Gastrux

- `DeliveryPlatform.keeta` already exists in `prisma/schema.prisma` (enum line ~3944). No enum migration.
- The delivery pipeline: `lib/delivery-orders/ingest.ts` (`ingestDeliveryOrder`, `acceptDeliveryOrder`,
  `rejectDeliveryOrder`, `NO_ITEMS_ALERT`), `lib/delivery-orders/input.ts` (`OrderApiInput`, incl. `taxaServico`),
  `lib/delivery-orders/platform-sync.ts` (`pushPlatformStatus`, `PLATFORM_WORDS`, `cancelPlatformOrder`,
  `platformCancelReasons`, `answerDispute`), `lib/kds-integration.ts`, Caixa/DRE by platform, sino, Pedidos de delivery.
- iFood (`lib/ifood/*`): **polling** every 30 s from `instrumentation.ts` with a DB lease (`poll_leases`), event table,
  ack after storing. 99Food (`lib/ninetynine/*`): **webhook → `ninetynine_events` → worker loop**, link requests
  confirmed by Gastrux staff at Plataforma › Lojas da 99Food (`app/admin/platform/99food`), state in its own table
  `ninetynine_store_states`, tokens encrypted with `lib/security/credential-crypto`.

## 1. Intent and scope of stage 1

**Goal:** a Business restaurant links its Keeta store; Keeta orders arrive in Pedidos de delivery and the kitchen
through the existing pipeline; Gastrux sends confirm / ready / dispatch / delivered / cancel back; the restaurant
answers customer refund requests; "Loja aberta/fechada" opens and closes the store on Keeta.

In stage 1:
- Orders in (polling), order detail, confirm, ready for pickup, dispatch + delivered (merchant self-delivery only),
  request cancellation, accept/reject refund, decrypt customer data on self-delivery orders.
- Store linking (self-serve authorization + staff confirmation), onboarding (`PUT /v1/merchantOnboarding`).
- Store open/close (`POST /v1/merchantUpdate/{merchantId}` with `merchantStatus` only) and status read
  (`GET /v1/merchant/{id}/status`).
- Help article, AI knowledge, manual, Pedidos de delivery labels.

Out of stage 1 (**our call**, same as 99Food):
- **Menu sync** (`GET /v1/merchant` hosted by us, menu push, image upload). Keeta "strongly recommends" it
  (`general-info`) but nothing in the public docs makes it mandatory; onboarding requires only `keetaMerchantId`
  (`getMerchantURL` is optional in `MerchantAPIInfo`). Bonus reason to wait: once a menu is pushed by API, Keeta locks
  manual menu editing in the Merchant Portal (`test-store-management`), which would break restaurants that keep their
  menu on Keeta today. Items are matched by `externalCode` (the "PDV Code" the restaurant types on Keeta) to the
  Gastrux product code, else by name; unknown items follow the part-1 rule (text to the kitchen + sino).
- Store hours sync (UTC conversion rules in `time-zone-conversion` only matter for hours/menu).
- Delivery tracking push (`/tracking`), shop-level authorization-code apps, Keeta-native portal webhooks other than
  authorization (codes 1001–1202, see §2).

### Go-live requirements (from `how-to-start`, `development-guides`, FAQ)

1. NDA signed with Keeta: NOT done. The docs (How to Start) say the Keeta team signs the NDA and then issues the developer account plus the test app ID/secret. The owner self-registered on the portal; on 2026-11-13 every save there fails with "Failed to get service provider information" and tickets with "Service provider not found", so the account is not yet a service provider. First step: contact the Keeta team for the NDA.
2. Dev Portal profile complete: company logo (visible to customers), contact phone, contact email, merchant-operations
   email (Keeta sends test-store credentials and authorization notices there).
3. Test store created with the Test Store Tool and linked to a Keeta Test App user (Brazilian phone works; test region
   is Bongolava, Madagascar).
4. **SOW** downloaded from Integration Document Management, filled in, uploaded **before** SIT.
5. **Developer self-test** using Keeta's SIT case file; self-test records submitted before SIT.
6. **Joint SIT (homologation)** online with Keeta; they test merchant-subsidised **and** platform-subsidised promotions
   and check the promotion data is parsed right (`test-store-management`). On sign-off Keeta issues the **production
   app** (new ID + secret). Test apps never see real merchant data.
7. **UAT pilot**: Keeta places and pays real orders at a real customer restaurant using the production app, checking
   "menu management, order management, KDS, receipt printing" (`how-to-start`). We may propose the restaurant.
8. Recommended: operational meeting; optional operations sub-accounts in the Dev Portal.

Runtime rules that SIT will exercise (`development-guides`):
- Confirm or cancel within **5 minutes**; otherwise Keeta auto-cancels **and temporarily closes the store**.
- Every polled event acknowledged once, including events we ignore; dedupe by event id.
- Poll **at most 2 requests/minute per token** (recommended every 30 s); event TTL 4 h 10 min.
- `X-App-Signature` on every request; onboarding before any order event is visible.
- Never call the same transition twice (Keeta answers 422 "order status is not in a valid state", FAQ `order-api`).

## 2. Polling vs webhook

**Decision: polling for order events (our call), plus one small webhook for authorization notices.**

| | Polling (`GET /v1/events:polling` + ack) | Webhook (`POST {ordersWebhookURL}`) |
|---|---|---|
| Latency | ≤ 30 s (2 req/min limit) | seconds |
| Downtime | events wait 4 h 10 min until acked | 3 retries at +1, +2, +3 min, then "undelivered" |
| Auth of inbound data | none needed (we call Keeta) | `X-App-Signature`, format partly ambiguous |
| Fits | iFood poller + `poll_leases` lease | 99Food route + worker |

Reasons: an Easypanel deploy restarts the single container; with webhooks an event lost after ~6 minutes is gone,
and a lost `CREATED` costs the store a temporary closure. Polling survives restarts, needs no public endpoint for
orders, and one app-level token covers all stores in one call (Keeta's batch polling, `general-info`). 30 s is well
inside the 5-minute window (iFood works the same way). The webhook can be added later as a fast path that writes to
the same event table.

Mechanics (mirror `lib/ifood/events.ts` + the 99Food worker):
- `lib/keeta/poller.ts` started from `instrumentation.ts` only with `KEETA_POLLING=on`, every 30 s, next tick only after
  the previous ends; lease row `name = 'keeta'` in the existing `poll_leases` table (no migration), hold 25 s.
- Request: no `eventType` filter (we want all; unknown types are stored and acked anyway). `x-polling-merchants`
  omitted (all linked stores) **(our call)**; Keeta caps it at 100 ids if we ever need it.
- **Store first, ack second:** insert rows into `keeta_events` (`createMany`, `skipDuplicates`, id = `eventId`), then
  `POST /v1/events/acknowledgment` with `[{id, orderId, eventType}]` (max 100 per call). An ack failure is harmless
  (the event comes back, the duplicate is skipped). 200 = events, 204 = none.
- Processing runs right after storing in the same tick (and on the next ticks for failures), with attempts, backoff
  and a sino after the last attempt, like `lib/ninetynine/events.ts`. A `CREATED` stops retrying at 4.5 min.
- Events for orders whose `merchant.id` matches no active Business integration are marked processed with a note,
  never ingested.

**Authorization webhook** `POST /api/integrations/keeta/authorization` (Dev Portal codes 1301 add / 1302 revoke,
"Loja real" and "Loja de teste"; body `WebhookNotification {clientId, authId, opType 1|2, shopId, shopName,
createTime}`; answer 200 within 5 s with `{"status":0,"title":"success"}`). Store into `keeta_events`
(id `auth:{authId}:{opType}:{shopId}`), process in the loop. Signature header `X-App-Signature`: the docs say
"SHA256 hash of the request body, using the client secret as the key" (`/webhook/authorization`); the order webhook
adds "encoded into Base64". We verify Base64(HMAC-SHA256(secret, raw body)) and also accept lowercase hex
**(our call)**; a mismatch is stored with `error='bad signature'` and logged, not acted on, until homolog shows the
real format. Either way an add (1301) only creates a candidate; linking still needs staff confirmation (§4).

Portal codes 1001–1008, 1101/1102, 1201/1202 are **not configured** in stage 1: the docs say regular order webhooks
use the Open Delivery onboarding field, and the portal page is "only" for authorization (`keeta-developer-portal`,
`/webhook/authorization`). 1303 (brand unauthorized) is configured to the same URL and treated like 1302 for all
the brand's linked stores **(our call; payload undocumented)**.

## 3. Auth, signature, time

**App type: "modo de token no nível do aplicativo" (`grant_type=app_level_token`)**, Keeta's recommendation for
Brazil. One token for all authorized stores; no per-store tokens to store or refresh.

- `POST /oauth/token`, JSON body `{"client_id","client_secret","grant_type":"app_level_token"}` → `{access_token,
  token_type:"bearer", expires_in}` (seconds; **no refresh token** in this mode). The `requestBodies.Token` component
  says form-urlencoded, the path says JSON: use JSON **(our call)**, fall back to form if homolog rejects it.
- Cache the token encrypted (`credential-crypto`) in `keeta_app_state` (one row) with `expiresAt = now + expires_in`;
  renew when < 5 min left, or on 401 / "access token has expired" / "is invalid" (FAQ `authentication`), then retry the
  call **once**. A process-local promise avoids two concurrent renewals.
- Token fails with "This client_id has no authorized Merchant" until at least one store (the test store) authorizes
  the app (FAQ `authentication`): the integration screen shows "Nenhuma loja autorizou o Gastrux ainda".
- `Authorization: Bearer <token>` on every call except `/oauth/token` and `/oauth/authorization/url`.

**Request signature** (`signature-calculation`), header `X-App-Signature`, on every OAuth2-secured call:
1. `url` = full URL without query, e.g. `https://open.mykeeta.com/api/open/opendelivery/v1/orders/123/confirm`.
2. Query params sorted by key, each `key=value` (null → empty string), each prefixed with `&`.
3. Body: if non-blank, `&` + the exact JSON text sent. The docs require RFC 8785 canonical JSON: we serialize our own
   bodies with sorted keys and no whitespace, sign that string, and send **that same string** as the body.
4. `Base64(HMAC-SHA256(key = client_secret UTF-8, message = string UTF-8))`.
Examples to unit-test (from the docs): `https://api.example.com/v1/users&limit=10&page=2&sort=name`;
`https://api.example.com/v1/orders&{"userId":123,"productId":456,"quantity":2}`. Keeta's verification tool
(`https://toolset.mynocode.host/`) gives a known pair for the test. Ambiguity: whether the token call is signed
(its `security` is empty): send without; add if rejected.

**Inbound** order webhook (not used in stage 1): `X-App-Signature` = Base64(HMAC-SHA256(secret, body)), headers
`X-App-Id`, `X-App-MerchantId`.

**Time** (`time-zone-conversion`, schemas): every timestamp in the API is UTC ISO 8601 (`createdAt`,
`preparationStartDateTime`, `schedule.*`, `estimatedDeliveryDateTime`); parse with `new Date()` and show in the
restaurant's time zone as today. The UTC hour-splitting rules apply only to service hours, which are out of stage 1.
Refund metadata timestamps (`opTime`) are epoch **ms**.

**Large ids:** OD ids are strings; refund metadata ids (`orderViewId`, `afterSaleOrderId`, ~15–16 digits) sit near
2^53. Parse the metadata string with the existing `json-bigint` helper (`storeAsString`) **(our call)**.

**IP whitelist:** add `31.97.19.221` (homolog and app run on the same VPS) to both the test and production apps.

## 4. Store authorization and linking

Keeta's model (`merchant-authorization`, `merchant-self-serve-authorization`, `/v1/merchantOnboarding`): the
merchant authorizes our app in Keeta (three ways: "Activar aplicativo" with our APP ID in the Merchant Portal; a URL
from the Dev Portal "Add Authorization"; or a URL from `GET /oauth/authorization/url`). We then **register a mapping**
with `PUT /v1/merchantOnboarding?merchantId=<our id>` body `{"keetaMerchantId": <Keeta shopId>}`. No onboarding → no
events. Our `merchantId` must be unique; `x-polling-merchants` requires 36–100 chars, so we use a **UUID v4**
generated at link time **(our call)**. Keeta echoes it as `order.merchant.id`, which is how events route to a
restaurant (`DeliveryIntegration.storeId` = that UUID; `@@unique([platform, storeId])` already exists).

Flow (mirrors 99Food, where phones do not prove ownership):
1. Configurações › Integrações › Keeta (dono/gerente, Business): **"Conectar Keeta"** → server calls
   `GET /oauth/authorization/url?clientId=<id>&redirectUri=https://<host>/admin/integrations/keeta/retorno` and
   opens the returned `merchantAuthorizationUrl`.
2. The merchant logs into Keeta (store or brand account), picks the store(s), confirms.
3. Keeta redirects to `retorno?authId=…&state=…&appId=…&timestamp=…`. The page runs under the restaurant's session
   (that, not `state`, identifies the restaurant; the API has no `state` input). Server calls
   `GET /oauth/authorized/{authId}/merchantInfo` (pages of ≤100) and lists the shops (name, address).
4. The restaurant picks its store → **link request** in `keeta_store_states` (`linkRequestShopId`, name, address,
   authId, requestedBy/at); `storeId` stays null; the staff is rung (same helper as 99Food). Copy: "Pedido enviado. A
   equipe do Gastrux confere e liga sua loja em até 1 dia útil."
5. Staff at **Plataforma › Lojas da Keeta** (`/admin/platform/keeta`) confirms after checking with the restaurant →
   generate UUID → `PUT /v1/merchantOnboarding` → save `storeId`, `storeName`, `keetaShopId` (unique) → audit + sino
   to the restaurant: "Sua loja da Keeta está ligada ao Gastrux." Staff can also refuse.
   Why staff confirms: `authId` arrives in a URL the user can edit and looks sequential (example `41008`), so a
   crafted `authId` could list another merchant's stores.
6. Authorizations made outside our button (APP ID in the Merchant Portal, Dev Portal URL) arrive by webhook 1301;
   they appear on the staff screen as "Autorizadas, sem restaurante", and the staff links them to a restaurant
   directly ("Não encontramos sua loja" path, and the **test store**).
7. Revocation (1302/1303) or a 403 on a store call → integration `syncStatus = ERROR`, "A Keeta removeu a autorização
   do Gastrux" + sino; polling simply stops returning its events. "Desconectar" in Gastrux clears the link (re-onboarding
   the same ids later replaces Keeta's mapping, per `/v1/merchantOnboarding` note 2); the restaurant revokes on Keeta.

Unknowns kept small: whether Keeta keeps extra query params on `redirectUri`, and whether `redirectUri` must be
pre-registered (see §10). If redirects fail, step 3 falls back to "Já autorizei" → staff links from the 1301 list.

**Test store:** created by the owner with the Test Store Tool; authorized to the **test app**; staff-linked to the
homolog test restaurant from the 1301 list.

## 5. Order mapping (`GET /v1/orders/{orderId}` → `OrderApiInput`)

Money: OD `Price.value` is a decimal in **reais** (up to 4 decimals; currency `BRL`) — not cents. Round to 2 places.
Refund metadata amounts (`money`, `price`, `refundPrice`) are integer **minor units** (sample `7500` = `$75.00`):
divide by 100. New module `lib/keeta/order-map.ts`: `mapKeetaOrder(order) → { input, extraNote, platformData }`.

| Gastrux field | Keeta source | Rule |
|---|---|---|
| `codigo` | `id` | the Keeta order id, string |
| `cliente.nome` | `customer.name` | else `Cliente Keeta` |
| `cliente.celular` | `customer.phone.number` | `ENC_…`: decrypt only when `delivery.deliveredBy = MERCHANT`; else `00000000000` + note "Telefone pela Keeta" (like iFood) |
| `retirada` | `type` | `TAKEOUT` → true (Keeta says no self-pickup today, map anyway); `INDOOR` → true + note "Consumo no local" (our call); `DELIVERY` → false |
| `entrega.*` | `delivery.deliveryAddress` | street, number, complement, district (`bairro`), city, postalCode (`cep`), reference. `ENC_` fields (`number`, `district`, `complement`, `formattedAddress`) decrypted on self-delivery; on Keeta delivery shown as "Entrega pela Keeta (endereço protegido)" + street/city if plain |
| `itens[].codigo` | `items[].externalCode` | PDV code → Gastrux product code |
| `itens[].nome` | `items[].name` | weight units (`KG`, `L`, …): name + ` (0,5 kg)` and quantity 1 (our call, like 99Food) |
| `itens[].quantidade` | `items[].quantity` | integer for `UN`; fractional → see above |
| `itens[].precoUnitario` | `items[].unitPrice.value` | price the customer pays per unit (after markdowns) |
| `itens[].adicionais` | `items[].options[]` | `nome` = `Nx name` when quantity > 1; `preco` = `option.totalPrice.value` (per one item). Check `quantity × (unitPrice + Σ options) = item.totalPrice` ±0.01; if not, `precoUnitario = totalPrice/quantity`, adicionais at 0 (our call) |
| `itens[].observacao` | `items[].specialInstructions` + option instructions | |
| `taxaEntrega` | `otherFees[type=DELIVERY_FEE]` | only when `deliveredBy = MERCHANT` and `receivedBy = MERCHANT` |
| `taxaServico` | `otherFees[type=SERVICE_FEE, MIN_ORDER_FEE]` | only when the store collects the payment (`payments.pending > 0` and self-delivery or takeout) — owner rule 2026-11-13, same as iFood/99Food |
| (note only) | `otherFees[type=TIP]` | "Gorjeta R$ X" line, not in the sale (our call) |
| `desconto` | `discounts[].sponsorshipValues[]` | sum of `MERCHANT` + `CHAIN` amounts, all targets (CART, ITEM, DELIVERY_FEE); `MARKETPLACE` share does not reduce the sale. One note line per discount: "Cupom R$ X (loja R$ Y, Keeta R$ Z)" + `discountCode` |
| `total` | computed | `Σ items + taxaEntrega + taxaServico − desconto`; log a mismatch against `total.orderAmount − marketplace-paid parts` in `platformData.totalCheck` |
| `pagamento.forma` | `payments.methods[]` main = first `PENDING`, else largest | CREDIT → CREDITO, DEBIT → DEBITO, CREDIT_DEBIT → CREDITO, PIX → PIX, CASH → DINHEIRO, MEAL/FOOD_VOUCHER → VALE_REFEICAO, others → OUTRO; `brand` in the note |
| `pagamento.pago` | `payments.pending` | `pending === 0` |
| troco | `methods[CASH].changeFor` | note "Troco para R$ X: levar R$ Y" (Y = changeFor − cash value), not `trocoPara` (iFood rule) |
| `agendadoPara` | `schedule.scheduledDateTimeStart` | when `orderTiming = SCHEDULED` |
| `observacao` | `extraInfo` | |

`extraNote` lines: `Keeta #<displayId> · código <id>`; `Entrega Keeta` / `Entrega própria` / `Retirada`; payment;
troco; discounts with who pays; `Código de coleta <delivery.pickupCode>`; `Comece a preparar às HH:MM` when
`preparationStartDateTime` is later than `createdAt`. Customer stays out of the CRM and cashback (platform customer).

`platformData`: `{ displayId, orderType, deliveredBy, orderTiming, pickupCode, preparationStartAt, sendDelivered,
estimatedDeliveryAt, deliveryStatus, refund?: {...} }`.

**Decryption and privacy** (`/v1/batchDecrypt`, FAQ `order-api`): call once per new self-delivery order with all
`ENC_` values (≤ 5, cap 50). Keeta-delivery data cannot be decrypted (the call fails by design), so we never try.
Plain text is stored only in the `ExternalOrder` fields the delivery needs, never logged, never in `keeta_events`
(which keeps the encrypted payload). A failed decrypt does not block the order: it comes in with "Endereço: veja no
app da Keeta" and a sino. Retention as other platforms (LGPD purpose: fulfilling the delivery).

## 6. Status mapping

Gastrux → Keeta (`pushPlatformStatus`, new `callKeeta` branch; iFood/99Food untouched):

| Gastrux change | Keeta call | Notes |
|---|---|---|
| `confirm` (Aceitar or auto-accept) | `POST /v1/orders/{id}/confirm` `{createdAt, orderExternalCode, preparationTime?}` | `createdAt` = the order's `createdAt` (field text says "Order creation date"; our call); `orderExternalCode` = kitchen order number; set `platformConfirmedAt` |
| `preparing` | none | Keeta has no preparing endpoint |
| `ready` | `POST /readyForPickup` | Keeta delivery only |
| `dispatch` (Saiu para entrega) | `POST /dispatch` `{}` | self-delivery only |
| delivered | `POST /delivered` | self-delivery only, when `sendDelivered !== false` |
| `{cancel}` (Recusar / Cancelar) | `POST /requestCancellation` `{reason, code, mode:"MANUAL"}` | 202 ≠ cancelled: kitchen order is cancelled only on the `CANCELLED` event (`development-guides`), like iFood/99Food |
| refund answer | `POST /acceptRefund` or `/rejectRefund` `{reason, code}` | |

A 422 "not in a valid state" on a repeated call is treated as already done (logged, no error to the user).

Keeta → Gastrux (events; `ExternalOrderStatus` moves forward only via `canMoveExternalOrderStatus`):

| Event | Gastrux |
|---|---|
| `CREATED` | fetch detail, decrypt if self-delivery, ingest. Auto-accept → confirm now; else sino now and at 3 min (5-min limit). `NO_ITEMS_ALERT.keeta` copy: "…a Keeta cancela em 5 minutos e pode fechar a loja por um tempo…" |
| `CONFIRMED` | accepted elsewhere (Merchant Portal): accept kitchen order if pending, set `platformConfirmedAt` |
| `RECOMMENDED_PREPARATION_START` | sino "Pode começar o pedido Keeta #N" |
| `PICKUP_ONGOING`, `RIDER_ARRIVED_AT_STORE` | `platformData.deliveryStatus` "Entregador a caminho" / "Entregador chegou" |
| `READY_FOR_PICKUP` | READY |
| `ORDER_COLLECTED`, `DISPATCHED` | PICKED_UP ("Em entrega") |
| `DELIVERED`, `CONCLUDED` | DELIVERED |
| `CANCELLATION_REQUESTED` | echo of ours: log "Cancelamento pedido à Keeta" |
| `CANCELLED` | before DELIVERED: cancel kitchen order, CANCELLED, out of the sale, sino. After DELIVERED (Keeta support can cancel up to 30 days later): leave the sale, sino + log "A Keeta cancelou o pedido #N depois de entregue; confira no portal da Keeta" (our call; docs allow ignoring) |
| `USER_REFUND_REQUEST` | dispute: `disputeId = afterSaleOrderId`, `platformData.disputeKind = 'refund'`, amount, partial flag, items, `applyReason`; "Pedido de devolução" with Aceitar / Recusar in Pedidos de delivery + sino (repeats don't re-ring) |
| `REFUNDED` | clear dispute, log + sino "A Keeta devolveu R$ X ao cliente do pedido #N"; sale not changed automatically (see §10) |
| `REFUND_FAILED` | clear dispute, log |
| unknown | store, ack, mark processed |

**Cancellation codes** (`RequestCancelled.code`, v1.0.7 list; pt-BR labels, `lib/keeta/reasons.ts`):
`UNAVAILABLE_ITEM` Item indisponível · `INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT` Loja sem condições agora (muito
movimento, falta de energia) · `OUTSIDE_DELIVERY_HOURS` Fora do horário de funcionamento · `SYSTEMIC_ISSUES` Problema no
sistema · `DUPLICATE_APPLICATION` Pedido duplicado · `BLOCKED_CUSTOMER` Cliente bloqueado ·
`RESTAURANT_WITHOUT_DELIVERY_PERSON` Sem entregador · `ORDER_OUTSIDE_THE_DELIVERY_AREA` Fora da área de entrega ·
`RISK_AREA` Endereço em área de risco · `DELIVERY_PROBLEM` Problema na entrega. The last four only on self-delivery
**(our call)**. `OUTDATED_MENU` is **not offered** in stage 1: it deactivates the `invalidItems` by Keeta item id,
which needs menu sync. `reason` text is required (prefilled with the label, editable). Keeta warns that frequent
cancellations can close the store; the reject dialog says "Cancelar muitos pedidos pode fechar sua loja na Keeta".

**Refund rejection codes** (`RequestDenied.code`): `DISH_ALREADY_DONE` O pedido já estava pronto ·
`OUT_FOR_DELIVERY` O pedido já saiu para entrega · `OTHER` Outro motivo (text required).

**Timeouts:** confirm 5 min (auto-cancel + temporary store closure). Customer cancellation (Keeta delivery) is only
possible before confirm and needs no merchant answer, so there is no cancel handshake. Refund: **no timeout in the
docs**; the Merchant Portal and the API can both answer and the first answer wins. We show the request with no
countdown and drop the buttons when `REFUNDED`/`REFUND_FAILED` arrives or the call returns 422.

## 7. Data model, env, gate

New tables only (Deploy-before-migrate safe, like 99Food: the code checks env and tolerates missing rows):
- `keeta_events` (`KeetaEvent`): `id` (Keeta `eventId`, or `auth:…` for webhooks) PK, `type`, `orderId?`,
  `merchantId?`, `payload Json`, `source` ('polling' | 'auth-webhook'), `receivedAt`, `processedAt?`, `attempts`,
  `error?`, `nextAttemptAt?`; indexes as `ninetynine_events`. Rows kept 30 days.
- `keeta_store_states` (`KeetaStoreState`): `integrationId` PK → `DeliveryIntegration`; `keetaShopId String? @unique`,
  `keetaShopName`, `keetaAuthId`, `linkRequestShopId`, `linkRequestShopName`, `linkRequestAddress`,
  `linkRequestedAt`, `linkRequestedBy`, `keetaStatus` (AVAILABLE/UNAVAILABLE), `statusCheckedAt`.
- `keeta_authorized_shops` (`KeetaAuthorizedShop`): `shopId` PK, `shopName`, `address?`, `authId`, `authorizedAt`,
  `revokedAt?` — filled by webhooks 1301/1302 and by `merchantInfo` reads; feeds the staff screen.
- `keeta_app_state` (`KeetaAppState`): `id` PK ('app'), `accessToken` (encrypted), `expiresAt`.
- `DeliveryIntegration` gets a relation field only (no column); `storeId` = our UUID merchantId.
- `DeliveryPlatform.keeta` exists. Lease: row in existing `poll_leases`.

Env (secrets only in Easypanel, never in chat or git): `KEETA_CLIENT_ID` (App ID), `KEETA_CLIENT_SECRET`,
`KEETA_BASE_URL` (default `https://open.mykeeta.com/api/open/opendelivery`), `KEETA_POLLING=on` (worker gate).
Missing id/secret → screen shows "Integração com a Keeta não configurada" and nothing is called. Homolog = test
app; app = production app after SIT.

Gate: same as iFood/99Food — `isTierFeatureEnabled(tier, 'deliveryPlatforms')` (Business) and
`restaurantAcceptsOrders`; dono e gerente connect/disconnect/pause. Locked plan → events processed with a note, no
ingest.

## 8. Screens and copy

- **Configurações › Integrações › Keeta** (`app/admin/integrations/keeta/page.tsx`, API
  `app/api/admin/integrations/keeta/route.ts`), cloned from 99Food:
  - Not linked: "1. Toque em **Conectar Keeta** e autorize o Gastrux na sua loja (entre com a conta da loja ou da
    marca na Keeta). 2. Volte aqui e escolha sua loja. 3. A equipe do Gastrux confere e liga." Note: "A loja precisa já
    estar aprovada na Keeta. O cardápio continua sendo editado na Keeta: use no campo Código PDV o mesmo código dos
    produtos do Gastrux."
  - Waiting: "Pedido enviado para a equipe do Gastrux" + "Cancelar pedido".
  - Linked: store name, status (Recebendo pedidos / Loja fechada na Keeta / Autorização removida), last order,
    "Desconectar".
- **Retorno** page `/admin/integrations/keeta/retorno`: list from `merchantInfo`, "Escolher esta loja"; empty →
  "Não encontramos lojas nesta autorização. Fale com o suporte."
- **Plataforma › Lojas da Keeta** (`app/admin/platform/keeta/page.tsx`, platform admins only, like
  `/admin/platform/99food`): pending requests (Confirmar / Recusar), "Autorizadas, sem restaurante" (link to a
  restaurant), linked stores. A shared component with the 99Food screen where it is a straight copy (our call: copy
  first, extract only if it stays identical).
- **Pedidos de delivery:** platform label "Keeta" (own color), card `Keeta #displayId` + code, "Entrega Keeta" /
  "Entrega própria", "Código de coleta", delivery status line, "Pedido de devolução" dispute with amount, items and
  Aceitar / Recusar (reason picker). `PLATFORM_WORDS.keeta = { name:'Keeta', The:'A Keeta', the:'a Keeta',
  of:'da Keeta' }`. Caixa/DRE line "Delivery: Keeta".
- **Loja aberta/fechada:** closing calls `merchantUpdate {merchantStatus:"UNAVAILABLE"}`, opening `AVAILABLE`, in the
  background like `followStoreToggle` (99Food). Keeta's text says UNAVAILABLE is for unexpected closures; it is the
  only open/close the API offers. Every 5 min (in the poll loop) `GET /v1/merchant/{id}/status` updates
  `keetaStatus`; a change to UNAVAILABLE not made by us rings "Sua loja está fechada na Keeta" (e.g. after a missed
  5-minute confirm).
- **Help/AI/marketing:** article "Como ligo a Keeta?" in `lib/help/seed-articles.ts` and update the delivery article
  that says "O Keeta ainda não está conectado" (add its old hash to `LEGACY_DEFAULT_HASHES`); replace the line in
  `lib/ai/knowledge/delivery.ts`; `contagem` texts already say "pela integração". `components/marketing/faq-section.tsx`
  and `features-showcase.tsx` keep "Keeta ainda não conectado" until the production app passes UAT. Manual updated.

## 9. Testing

Unit (`__tests__/unit/keeta-*.test.ts`):
- signature: the three doc examples (strings) and one HMAC value from Keeta's verification tool; sorted params; null
  param → empty; empty body skipped; body signed = body sent (canonical, sorted keys).
- token: cached until 5 min before expiry; renew + single retry on expired/invalid; no loop on a second failure.
- order map fixtures: Keeta delivery prepaid with merchant + marketplace discount; self-delivery cash with change,
  delivery fee, service fee (store collects → `taxaServico`); options with quantity; KG item; scheduled; `ENC_`
  values with and without decryption; totals in reais; refund metadata in cents.
- reasons: self-delivery-only codes hidden on Keeta delivery; `OUTDATED_MENU` absent.

Integration (`__tests__/integration/delivery/keeta-*.test.ts`, mock `lib/keeta/client`):
- poll stores then acks; duplicate event id → one row, one order, one confirm; ack failure → no duplicate on next poll.
- auto-accept confirms; manual does not; 422 on confirm treated as done.
- `CANCELLED` before/after delivery; `USER_REFUND_REQUEST` sets dispute once; accept/reject calls; reject needs reason.
- unknown merchant / locked plan / inactive → not ingested, processed with note.
- linking: request → staff confirm calls onboarding with UUID; same `keetaShopId` twice → 409 "Esta loja da Keeta já
  está ligada a outro restaurante do Gastrux"; non-Business blocked; auth webhook 1301 creates a candidate only;
  1302 sets ERROR.
- store toggle calls merchantUpdate; iFood and 99Food test files still pass unchanged.

Homolog plan (test app, `KEETA_POLLING=on` in homolog only):
1. Owner: profile complete, test app created ("modo de token no nível do aplicativo", IP `31.97.19.221`, webhook
   1301/1302/1303 "Loja de teste" → `https://homolog.gastrux.com/api/integrations/keeta/authorization`), env set.
2. Test store created; authorize the test app; check 1301 arrives; staff links it to the test restaurant;
   onboarding OK in "Validação de mapeamento".
3. "Ferramenta de pedido teste": order → appears ≤ 30 s → Aceitar → confirmed on Keeta; Rider Simulator through
   pickup/delivery → statuses follow.
4. Recusar with each reason group; order not accepted for 5 min (expect auto-cancel; then reopen the store with the
   Test Store Tool).
5. Keeta Test App (Bongolava): full order, cash with change if offered, merchant and platform promotions (ask Keeta
   to add platform-subsidised items), refund request → Aceitar and Recusar paths.
6. Self-delivery test store (if Keeta can set one) → decrypt, dispatch, delivered.
7. Loja fechada/aberta → status in Merchant Portal; "Pesquisa de logs" to check our signatures and calls.
8. Fill SIT self-test records → schedule joint SIT.

## 10. Open questions and risks

For Keeta (ask via Tickets):
1. SIT case file and SOW: does SIT or UAT require **menu sync** (GET /merchant or menu push)? UAT lists "menu
   management". If yes, menu sync becomes stage 2 before go-live.
2. `redirectUri`: must it be pre-registered? Does Keeta keep our own query params? Is `state` settable?
3. Exact `X-App-Signature` format of the authorization webhook (Base64 vs hex) and the payload of 1303.
4. Refund request timeout and default outcome when the merchant does not answer.
5. Can a test store be set to merchant self-delivery, and does Brazil have takeout at all?
6. `OrderConfirmed.createdAt`: order creation time or confirmation time?

For the owner:
7. Caixa/DRE after a `REFUNDED` or a post-delivery `CANCELLED` (Keeta deducts from the payout): only a log for now;
   confirm with the accountant.
8. Gorjeta (`TIP`) on a cash self-delivery order: outside the sale (our call) — OK?
9. Which real restaurant for the UAT pilot.

Risks:
- **Missed 5-minute confirm closes the store**: poll lag (≤ 30 s) + manual accept; mitigated by sino at 0 and 3 min
  and auto-accept recommended in the help article.
- **Event loss on long downtime** (> 4 h 10 min): out of our control; the poller logs gaps.
- **Rate limit** 2 polls/min per token: a second process polling (overlapping deploy) would hit it — the lease
  prevents it; status checks and order calls are other endpoints.
- **Signature canonicalization**: signing a different string from the body sent → every call 401; we sign the exact
  bytes we send.
- **Wrong store link**: staff confirmation + unique `keetaShopId`.
- **Privacy**: decrypted phone/address only on self-delivery orders, only in the order record.
- **Docs drift**: the json says v1.0.7 in places and v1.0.9 in the changelog; the guide says new orders come as
  `PLACED` while the API enum says `CREATED` — we treat both as new order.
