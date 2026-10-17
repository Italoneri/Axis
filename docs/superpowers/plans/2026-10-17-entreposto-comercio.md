# Entreposto: aba de Comércio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A master-curated shop in the Entreposto (`trading_post`). Players buy materials, which go to the camp stock, and equipment, which goes to the Depósito. The building panel gets a "buy what's missing" shortcut. At level 3, materials can be sold back.

**Architecture:** The shop lives in `GameState` (`state.shop`) and is changed only through new `GameCommand`s with pure rules in `src/systems/Shop.ts`, like every other system. Equipment lands in the Depósito, which is stored outside `GameState`. That delivery is a `DepotDelivery` the command outcome carries:
- **Online:** the Edge Function commits the state and inserts the depot rows in one SQL function (`commit_shop_purchase`).
- **Offline:** `main.ts` applies the delivery to the local depot right after the command.

**Tech Stack:** TypeScript, zod 4, Vitest, Supabase (Postgres + pgTAP, Edge Function bundle), vanilla DOM UI (`el` from `src/ui/dom.ts`).

**Spec:** `docs/superpowers/specs/2026-10-16-entreposto-comercio-design.md`

## Global Constraints

- All UI copy in pt-BR, in `src/i18n/pt-BR.ts`. Prices shown with `formatPrice` (biggest coins first, "1 Prata e 2 Bronze").
- Coin math in bronze integers (`toBronze`/`fromBronze`/`pay` from `src/systems/Coins.ts`). Prices are stored as `CoinBag` (`amountBagSchema`).
- Seed items: Madeira `wood` `{ bronze: 3 }`, Ferro `iron` `{ silver: 1 }`, Aetherium `aetherium` `{ silver: 5 }`. All three: infinite stock, minimum level 1.
- Promotion: `discountPercent` is an integer from 1 to 90. Unit price = `max(1, floor(base × (100 − d) / 100))` bronze.
- Sell back: Entreposto level 3 only. Pays `floor(baseUnitBronze × quantity / 2)` (on the total, base price, never the promotion) into the camp. Only for materials whose shop item is visible.
- Equipment destination: the buyer's private area. When the buyer is the master, the group depot (`ownerId: null`). The master's purchases are free.
- Payer: a player chooses `camp` or their own character wallet, for any item (the coffer may pay for private equipment: Ítalo's call). The shortcut always pays from `camp`.
- One shop item per material.
- The log never names an item delivered to a private area.
- Commits: conventional, `feat:`/`test:`/`docs:` with no ticket (branch `feat/entreposto-comercio`). Never push.
- Deploy order, for the final report only: `supabase db push` → `npm run deploy:functions` → site.

## Review Focus

1. **Two tabs, one stock.** Two players buy the last unit of a limited item at once. The second must get `out_of_stock` (revision conflict + re-run), never negative stock. → test in Task 4 (`refuses quantity above stock`).
2. **A material removed while its shop item exists.** The vitrine and the shortcut must skip the item, not crash. → tests in Task 2 (`hides items whose material is gone`) and Task 5.
3. **Entreposto demolished or downgraded.** Players must be refused (`not_for_sale`). The master still buys. → test in Task 4.
4. **Discount rounding near 1 bronze.** A 3-bronze item at 90% still costs 1, and the shortcut total equals the sum of its lines. → tests in Task 2.
5. **Imported/old saves.** A version-7 save gains the 3 seed items, and a save that already has `shop` keeps its own. → test in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/model/schema.ts` (modify) | `shopItemSchema`, `shopSchema`, `depotItemKindSchema`, `state.shop`, new log entries, `SAVE_VERSION = 8` |
| `src/data/shop.json` (create) | Seed items |
| `src/model/catalog.ts`, `src/data/gameData.ts`, `src/server/catalog.ts` (modify) | `seed.shop` + validation that seed material ids exist |
| `src/systems/SaveSystem.ts` (modify) | `createInitialState` + migration 7→8 |
| `src/systems/Shop.ts` (create) + `Shop.test.ts` | Pricing, visibility, master CRUD, buy, buy-missing, sell |
| `src/systems/Depot.ts` (modify) + test | `DepotDelivery`, `deliverToDepot`, reuse of `depotItemKindSchema` |
| `src/systems/GameImages.ts` (modify) + test | Image kind `shop_item` |
| `src/commands/schema.ts`, `applyCommand.ts` (modify) + test | Commands, permissions, `shop_purchased` change |
| `src/systems/outcome.ts` (modify) | New `ActionError`s |
| `src/server/gameDb.ts`, `memoryDb.ts`, `handler.ts` (modify) + `handler.test.ts` | `commitPurchase` |
| `supabase/migrations/20261017000000_shop.sql` (create) + `supabase/tests/shop_purchase.test.sql` | `commit_shop_purchase`, storage kind `shop_item` |
| `src/depotStore.ts`, `src/persistence/DepotRepository.ts`, `LocalDepotRepository.ts`, `src/main.ts` (modify) | Offline delivery |
| `src/ui/shop/ShopWindow.ts`, `src/ui/shop/shopViews.ts`, `src/ui/shop/ShopItemForm.ts` (create) | Vitrine, confirmation, master form |
| `src/ui/SlotPanel.ts` (modify) | Entreposto section + shortcut |
| `src/i18n/pt-BR.ts`, `src/ui/ui.css` (modify) | Copy, log texts, errors, card/ribbon styles |

---

### Task 1: Shop data in the save

**Files:**
- Modify: `src/model/schema.ts`, `src/systems/SaveSystem.ts`, `src/model/catalog.ts`, `src/data/gameData.ts`, `src/server/catalog.ts`, `src/systems/Depot.ts`
- Create: `src/data/shop.json`
- Test: `src/systems/SaveSystem.test.ts`, `src/model/catalog.test.ts`

**Interfaces:**
- Produces, in `schema.ts`:

```ts
export const depotItemKindSchema = z.enum(['equipamento', 'pocao', 'outro']);
const shopItemBase = {
  id: z.string().min(1),
  price: amountBagSchema,            // base price, CoinBag
  stock: positiveInt.nullable(),     // null = infinite
  minLevel: z.number().int().min(1).max(3),
  featured: z.boolean(),             // mercador de passagem
  hidden: z.boolean(),
  discountPercent: z.number().int().min(1).max(90).optional(),
  image: imageRef,                   // overrides the material icon / equipment photo
};
export const shopItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...shopItemBase, kind: z.literal('material'), materialId: z.string().min(1) }),
  z.object({ ...shopItemBase, kind: z.literal('equipment'), name: displayName,
    description: z.string().max(2000), depotKind: depotItemKindSchema }),
]);
export const shopSchema = z.object({ items: z.array(shopItemSchema) });
// gameStateSchema gains: shop: shopSchema
export type ShopItem = z.infer<typeof shopItemSchema>; export type Shop = z.infer<typeof shopSchema>;
```

- `Seed` gains `readonly shop: Shop`. `SAVE_VERSION` becomes `8`.
- `Depot.ts`: `itemKindSchema` becomes an alias of `depotItemKindSchema`, so there is one source.

- [ ] **Step 1: Write failing tests**
  - `SaveSystem.test.ts`:
    - `seedsTheShopOnNewGames`: `createInitialState(catalog).shop.items.map(i => i.id)` equals the seed ids.
    - `migratesVersion7SavesWithSeedShop`: a v7 fixture without `shop` → `parseState` is ok, `version === 8`, and the 3 seed items are present.
    - `keepsAnExistingShopOnLoad`: a v8 save with one custom item keeps exactly that item.
  - `catalog.test.ts`: `rejectsSeedShopItemWithUnknownMaterial` (seed item `materialId: 'nope'` → catalog problem mentions `nope`).
- [ ] **Step 2:** `npx vitest run src/systems/SaveSystem.test.ts src/model/catalog.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
  - `shop.json`: 3 items, ids `shop_wood`, `shop_iron`, `shop_aetherium`, values from Global Constraints, `featured: false`, `hidden: false`, `stock: null`.
  - Load it into `seed.shop` in `gameData.ts` and `src/server/catalog.ts`.
  - Seed check in `seedProblems`.
  - `SAVE_MIGRATIONS[7] = (save) => ({ ...save, shop: { items: [] } })`.
  - `CATALOG_MIGRATIONS[7] = (state, catalog) => state.shop.items.length ? state : { ...state, shop: catalog.seed.shop }`.
  - Update `testFixtures.ts` states that build `GameState` by hand.
- [ ] **Step 4:** `npm test && npm run typecheck` → all pass.
- [ ] **Step 5:** `git commit -m "feat: add shop data to the save with seed materials"`

### Task 2: Pricing and visibility rules

**Files:**
- Create: `src/systems/Shop.ts`, `src/systems/Shop.test.ts`

**Interfaces:**
- Consumes: `ShopItem`, `builtLevel(state, 'trading_post')`, `toBronze`.
- Produces:

```ts
export const TRADING_POST_BUILDING_ID = 'trading_post';
export const SELL_BACK_LEVEL = 3;
export function tradingPostLevel(state: GameState): number;
export function baseUnitBronze(item: ShopItem, catalog: Catalog): number;
export function unitPriceBronze(item: ShopItem, catalog: Catalog): number;     // discount applied
export function sellBackBronze(item: ShopItem, quantity: number, catalog: Catalog): number;
/** null when the material is gone; name/icon come from the material for kind 'material'. */
export interface ShopEntry { item: ShopItem; name: string; image: string | undefined;
  unitBronze: number; isBasic: boolean /* stock === null */; isLocked: boolean /* minLevel > level */ }
export function shopEntries(state: GameState, catalog: Catalog, viewer: Actor): ShopEntry[];
export function isOnSale(state: GameState, item: ShopItem, viewer: Actor): boolean; // players: !hidden && level>=1 && level>=minLevel && material exists
```

`shopEntries` for a player returns only `isOnSale` items. For the master it returns all of them, with `isLocked` set and hidden ones included.

- [ ] **Step 1:** Table-driven tests in `Shop.test.ts`:
  - `unitPriceBronze`:
    - `{bronze:3}` with no discount → 3
    - with 25% → 2
    - with 90% → 1
    - `{silver:5}` with 10% → 45
  - `sellBackBronze`: wood × 10 → 15; aetherium × 3 → 75; ignores a 50% promotion (wood × 10 still 15).
  - `shopEntries`:
    - `hidesItemsAboveLevelFromPlayers`
    - `showsLockedItemsToMaster`
    - `hidesItemsWhoseMaterialIsGone`
    - `hidesEverythingWithoutTradingPost` for a player
- [ ] **Step 2:** `npx vitest run src/systems/Shop.test.ts` → FAIL.
- [ ] **Step 3:** Implement the signatures above.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** `git commit -m "feat: add shop pricing and visibility rules"`

### Task 3: Master edits the vitrine

**Files:**
- Modify: `src/systems/Shop.ts`, `src/commands/schema.ts`, `src/commands/applyCommand.ts`, `src/systems/GameImages.ts`, `src/systems/outcome.ts`, `src/i18n/pt-BR.ts`
- Test: `Shop.test.ts`, `applyCommand.test.ts`, `GameImages.test.ts`

**Interfaces:**
- Produces:

```ts
export type ShopItemFields = Omit<ShopItem, 'id' | 'discountPercent' | 'image'>; // discriminated by kind
export function addShopItem(state: GameState, item: { id: string } & ShopItemFields): Outcome;
export function updateShopItem(state: GameState, id: string, fields: ShopItemFields): Outcome;
export function removeShopItem(state: GameState, id: string): Outcome;
export function setShopPromotion(state: GameState, id: string, discountPercent: number | null): Outcome;
```

- Commands (master only, not in `PLAYER_COMMANDS`):
  - `shop_item_create { id: newRecordId, item: shopItemFieldsSchema }`
  - `shop_item_update { itemId, item }`
  - `shop_item_remove { itemId }`
  - `shop_set_promotion { itemId, discountPercent: int 1..90 | null }`
- New `ActionError`: `'material_already_listed'`, `'out_of_stock'`, `'not_for_sale'`, `'invalid_quantity'`. Add them to `COMMAND_ERRORS` and `t.errors`.
- `IMAGE_KINDS` gains `'shop_item'`. `imageOf`, `recordExists` and `withImage` read and write `state.shop.items[].image`.
- These edits are not logged (my call, same as `set_image`), so changes return `resources(...)`.

- [ ] **Step 1:** Tests:
  - `rejectsSecondItemForSameMaterial` → `material_already_listed`, on create and on update to a listed material.
  - `rejectsMaterialItemForUnknownMaterial` → `not_found`.
  - `rejectsEmptyEquipmentName` → `empty_name`.
  - `setsAndClearsPromotion`.
  - `applyCommand`: `refusesShopEditsFromPlayers` → `forbidden`.
  - `GameImages`: `setsPhotoOfShopItem`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Validate the name with `.trim()` the way `addMaterial` does.
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** `git commit -m "feat: let the master manage shop items and promotions"`

### Task 4: Buying an item

**Files:**
- Modify: `src/systems/Shop.ts`, `src/systems/Depot.ts`, `src/model/schema.ts` (log), `src/commands/schema.ts`, `src/commands/applyCommand.ts`, `src/i18n/pt-BR.ts`
- Test: `Shop.test.ts`, `Depot.test.ts`, `applyCommand.test.ts`

**Interfaces:**
- `Depot.ts` produces:

```ts
export const SHOP_SECTION_NAME = 'Compras do Entreposto';
export interface DepotDelivery { itemId: string; ownerId: string | null; authorId: string;
  name: string; kind: ItemKind; quantity: number; notes: string }
export function shopSectionId(ownerId: string | null): string; // `entreposto-${ownerId ?? 'grupo'}`.slice(0, 64)
/** Reuses the live section with that id, else a live one with SHOP_SECTION_NAME in the area, else restores/creates `shopSectionId`. Item order = last + 1. */
export function deliverToDepot(depot: Depot, delivery: DepotDelivery, now: string): Depot;
```

  Export `depotAuthorOf` if it is not exported yet.
- `Shop.ts` produces:

```ts
export interface PurchaseOrder { itemId: string; quantity: number; payer: WalletRef; deliveryId: string }
export type PurchaseOutcome = { ok: true; state: GameState; delivery: DepotDelivery | null } | { ok: false; error: ActionError };
export function buyFromShop(state: GameState, catalog: Catalog, order: PurchaseOrder, actor: Actor): PurchaseOutcome;
```

  Rules, in this order:
  1. The item exists → otherwise `not_found`.
  2. `isOnSale` (master bypasses) → otherwise `not_for_sale`.
  3. `1 ≤ quantity ≤ 99_999` → otherwise `invalid_quantity`.
  4. `stock !== null && quantity > stock` → `out_of_stock`.
  5. Player pays `unitPriceBronze × quantity` from `payer` via `pay` → `insufficient_coins`. Master pays nothing.
  6. Decrement a limited stock.
  7. Material → `adjustMaterial` +quantity. Equipment → `delivery` with `ownerId = actor.role === 'master' ? null : actor.characterId`.
- Log entry (`schema.ts`):

```ts
{ ...entryBase, kind: 'shop_purchased', quantity, bronze, wallet: walletLabel,
  item: z.string().optional() /* omitted when delivered to a private area */ }
```

  The log text lives in pt-BR `logEntryText`.
- Command (player + master): `shop_buy { itemId, quantity: int, payer: walletRefSchema, deliveryId: newRecordId }`.
  - `isAllowed` for a player: `payer.kind === 'camp' || payer.characterId === actor.characterId`.
  - New `StateChange`: `{ kind: 'shop_purchased'; delivery: DepotDelivery | null }`.

- [ ] **Step 1:** Tests:
  - `buyFromShop`, table-driven:
    - `addsMaterialToCampStock` (wood × 12 from camp costs 36 bronze)
    - `paysFromOwnWallet`
    - `refusesQuantityAboveStock` → `out_of_stock`, stock unchanged
    - `decrementsLimitedStock`
    - `keepsInfiniteStockNull`
    - `chargesDiscountedPrice`
    - `refusesWithoutTradingPost` → `not_for_sale` for a player
    - `masterBuysFreeIntoGroupDepot` (delivery `ownerId: null`, wallets untouched)
    - `playerEquipmentGoesToPrivateArea`
    - `logOmitsItemForPrivateDelivery`
  - `deliverToDepot`:
    - `createsShopSectionOnce`: two deliveries → one section, two items
    - `reusesSectionWithSameNameInArea`
    - `restoresTrashedShopSection`
  - `applyCommand`:
    - `refusesPayingFromAnotherCharacter` → `forbidden`
    - `allowsPlayerToPayFromCamp`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** `git commit -m "feat: let players buy shop items"`

### Task 5: Buy what's missing and sell back

**Files:**
- Modify: `src/systems/Shop.ts`, `src/model/schema.ts`, `src/commands/schema.ts`, `src/commands/applyCommand.ts`, `src/i18n/pt-BR.ts`
- Test: `Shop.test.ts`, `applyCommand.test.ts`

**Interfaces:**

```ts
export interface PurchaseLine { itemId: string; materialId: string; quantity: number; bronze: number }
export interface MissingPurchase { lines: PurchaseLine[]; totalBronze: number; /** material ids not buyable (no item, not on sale, short stock) */ unavailable: string[] }
export function missingPurchase(state: GameState, catalog: Catalog, cost: Cost, viewer: Actor): MissingPurchase;
export function buyMaterials(state: GameState, catalog: Catalog, lines: readonly { itemId: string; quantity: number }[], actor: Actor): Outcome; // camp pays; all-or-nothing
export function sellToShop(state: GameState, catalog: Catalog, order: { materialId: string; quantity: number }, actor: Actor): Outcome;
```

- `missingPurchase` uses `materialNeeds(state.materials, cost.materials)`.
- `buyMaterials` re-checks every line with the `buyFromShop` rules, so a stale UI total is refused instead of charged differently. It logs one `shop_purchased` per line.
- `sellToShop` needs `tradingPostLevel ≥ 3` (else `not_for_sale`), a visible material item (else `not_for_sale`), and enough stock (else `insufficient_materials`, an existing error if there is one, otherwise `invalid_quantity`). It gives the coins to the camp with `fromBronze`.
- Log: `{ ...entryBase, kind: 'shop_sold', material: z.string(), quantity, bronze }`.
- Commands (player + master):
  - `shop_buy_materials { lines: z.array({ itemId, quantity: int }).min(1).max(20) }`
  - `shop_sell { materialId, quantity: int }`
  - Both return `resources(...)`.

- [ ] **Step 1:** Tests:
  - `missingPurchase`:
    - Forja Nv2 with 96/108 wood and 8/10 aetherium → lines wood 12 (36) + aetherium 2 (100), total 136
    - `listsUnsellableMaterialAsUnavailable`
    - `skipsItemWhoseMaterialIsGone`
    - total equals the sum of the lines with a promotion active
  - `buyMaterials`: `isAllOrNothingWhenCampIsShort`.
  - `sellToShop`:
    - `paysHalfOnTotalToCamp` (10 wood → 15 bronze)
    - `refusesBelowLevel3`
    - `refusesWhenItemHidden`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** `git commit -m "feat: add buy-missing shortcut and sell back rules"`

### Task 6: Atomic equipment delivery online

**Files:**
- Modify: `src/server/gameDb.ts`, `src/server/memoryDb.ts`, `src/server/handler.ts`
- Create: `supabase/migrations/20261017000000_shop.sql`, `supabase/tests/shop_purchase.test.sql`
- Test: `src/server/handler.test.ts`

**Interfaces:**
- `GameDb` gains:

```ts
/** commitUpdate plus the depot rows, in one transaction; false on revision conflict. */
commitPurchase(update: GameUpdate & { delivery: DepotDelivery }): Promise<boolean>;
```

  - `rpcGameDb` calls `commit_shop_purchase` with the `commit_game_update` args plus `delivery jsonb`.
  - `memoryDb` stores deliveries in a `deliveries: DepotDelivery[]` array that tests can read.
- `handler.ts` `command` action: when `outcome.change.kind === 'shop_purchased' && outcome.change.delivery`, call `commitPurchase`. Otherwise call `commitUpdate`.
- SQL `commit_shop_purchase(target_game, expected_revision, next_state, acting_user, acting_name, command, entries, delivery jsonb) returns boolean`:
  - `security definer`, service role only. Grant and revoke like `commit_game_update`.
  - Calls `public.commit_game_update(...)`, and returns false when that returns false.
  - Then resolves the section with the same 3-step rule as `deliverToDepot`: live section with id `entreposto-<owner|grupo>` → live section named `Compras do Entreposto` in that area → restore or insert the `entreposto-…` section. The server has no depot in memory, so SQL repeats this lookup. Keep it in one plpgsql block with a comment pointing to `deliverToDepot`. `DepotDelivery` stays as defined in Task 4.
  - Inserts into `depot_items` with id `delivery->>'itemId'`, `owner_id` = the section's, and `position` = last + 1.
- Same migration: `create or replace` the storage path function from `20261013000000_game_images.sql` so `parts[2]` also accepts `'shop_item'` (master write, members read). Copy the function body and change only that list.

- [ ] **Step 1:** Tests:
  - `handler.test.ts`:
    - `commitsEquipmentPurchaseWithDelivery`: memoryDb has 1 delivery and the state is charged
    - `materialPurchaseUsesPlainCommit`: no delivery
    - `conflictLeavesNoDelivery` → 409
  - pgTAP `shop_purchase.test.sql`:
    - creates the section once across two calls
    - rolls back the item when the revision conflicts
    - the item's `owner_id` equals the delivery owner
    - `authenticated` cannot execute the function
- [ ] **Step 2:** `npx vitest run src/server` → FAIL. `npx supabase test db` → FAIL (if the local stack is available; if not, say so in the report).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/server && npm run check:functions && npm run parity` pass. Also `npx supabase test db` when available.
- [ ] **Step 5:** `git commit -m "feat: deliver bought equipment atomically online"`

### Task 7: Offline delivery

**Files:**
- Modify: `src/persistence/DepotRepository.ts`, `src/persistence/LocalDepotRepository.ts`, `src/depotStore.ts`, `src/main.ts`
- Test: `src/persistence/LocalDepotRepository.test.ts`

**Interfaces:**
- `DepotStore.deliver(delivery: DepotDelivery): Promise<boolean>` runs through `enqueue`. It applies `deliverToDepot` and saves through a new `DepotRepository.deliver(delivery, now)`. Online, `SupabaseDepotRepository.deliver` is a no-op that resolves to `true`, because the server already wrote the rows and realtime brings them.
- `main.ts`: `store.subscribe((_s, change) => { if (change.kind === 'shop_purchased' && change.delivery && !mode.isOnline) void depot.deliver(change.delivery); })`.

- [ ] **Step 1:** Test `LocalDepotRepository.test.ts` `deliversIntoLocalStorage`: after `deliver`, `load()` holds the "Compras do Entreposto" section and the item.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** `git commit -m "feat: deliver bought equipment to the local depot"`

### Task 8: Vitrine (player view)

**Files:**
- Create: `src/ui/shop/ShopWindow.ts`, `src/ui/shop/shopViews.ts`
- Modify: `src/ui/SlotPanel.ts`, `src/main.ts`, `src/i18n/pt-BR.ts`, `src/ui/ui.css`
- Test: `src/ui/shop/shopViews.test.ts`

**Interfaces:**
- `new ShopWindow({ game: GameStore, session, memory: UiMemory, viewer: () => Actor })`, with `open(): void`. Pattern: `MenuWindow` (a `<dialog>`, it re-renders on `game.subscribe`, Escape stays inside).
- `shopViews.ts`:

```ts
export type ShopFilter = 'tudo' | 'basicos' | 'raros';
export function filterEntries(entries: ShopEntry[], filter: ShopFilter): ShopEntry[];
export function shopCard(entry: ShopEntry, ctx: { catalog: Catalog; onBuy(): void; onPromo?(): void }): HTMLElement;
export function confirmPurchase(opts: { title: string; lines: string[]; totalBronze: number;
  payers: WalletRef[] | null /* null = master, free */; maxQuantity: number | null }): Promise<{ quantity: number; payer: WalletRef } | null>;
```

- Layout (model A):
  - Header "⚖ Entreposto — Comércio".
  - Filter tabs, remembered in `UiMemory` key `shop.filter`.
  - Merchant banner: `featured` entries, hidden when there are none.
  - Grid of cards: image, name, price, stock "∞"/number, button.
  - `stock === 0` → class `shop-card--out`, label "Esgotado", button disabled.
  - Promotion → ribbon `−{d}%`, `<s>` old price, new price highlighted.
- Buying: `confirmPurchase`, then `store.dispatch({ type: 'shop_buy', ..., deliveryId: newId('item') })`. Payers: camp + own character for players, null for master.
- `SlotPanel.extraSections`: `trading_post` → card with hint + "Abrir comércio" button (pattern `menuSection`).
- Level 3: a "Vender" button on material cards opens `confirmPurchase`-style confirmation with the sell value and dispatches `shop_sell`.

- [ ] **Step 1:** Tests in `shopViews.test.ts` (jsdom, like `widgets.test.ts`):
  - `filtersBasicsAsInfiniteStock`
  - `marksOutOfStockCard`
  - `showsPromotionRibbonAndOldPrice` (25% on `{silver:1}` → "−25%", old "1 Prata", new "7 Bronze")
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement, using the colour tokens in `ui.css` (`--gold`, `--surface-raised`, `--border`).
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` pass. Then `npm run dev`: build an Entreposto through master tools, open Comércio, buy 12 Madeira, and check the stock went up by 12.
- [ ] **Step 5:** `git commit -m "feat: add the entreposto trade window"`

### Task 9: Master form and promotion

**Files:**
- Create: `src/ui/shop/ShopItemForm.ts`
- Modify: `src/ui/shop/ShopWindow.ts`, `src/ui/shop/shopViews.ts`, `src/i18n/pt-BR.ts`, `src/ui/MasterTools.ts`
- Test: `src/ui/shop/ShopItemForm.test.ts`

**Interfaces:**
- `openShopItemForm(opts: { catalog; state: GameState; item?: ShopItem }): Promise<{ id?: string; fields: ShopItemFields; image?: File | null } | null>`.
  - A type switch: Material / Equipamento.
  - Material → `<select>` of materials without an item (plus the current one when editing), by name, with the value being the id.
  - Equipamento → name, description, Depósito type, photo.
  - Common fields:
    - price inputs per coin (Ouro/Prata/Bronze)
    - "Estoque infinito" checkbox, else a number
    - minimum level 1–3
    - mercador de passagem
    - oculto
- Promotion popover on a card (master only): buttons 10% / 25% / 50%, a number from 1 to 90, "Tirar promoção" → `shop_set_promotion`.
- Master sees "Novo item", plus Edit/Remove on each card and the "libera no Nv X" badge on locked items.
- `MasterTools`: an "Entreposto" button that opens the window even without the building (same as the depot).
- Photo upload: same flow as NPC photos (`GameImages` + `set_image` with target `{ kind: 'shop_item', id }`).

- [ ] **Step 1:** Tests:
  - `materialListSkipsListedMaterials`
  - `infiniteStockSendsNull`
  - `priceInputsBuildCoinBag` (1 Prata + 5 Bronze → `{ silver: 1, bronze: 5 }`)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` pass. Then `npm run dev` as master: create an "Espada Rúnica" with photo and stock 1, put a 25% promotion on Madeira, and see the ribbon. As a player, buy the sword and see it in the private area's "Compras do Entreposto"; stock now Esgotado.
- [ ] **Step 5:** `git commit -m "feat: add master shop item form and promotions"`

### Task 10: Shortcut in the building panel

**Files:**
- Modify: `src/ui/SlotPanel.ts`, `src/i18n/pt-BR.ts`
- Test: `src/ui/buildingDetails.test.ts` (or a new `SlotPanel` helper test if the logic is extracted)

**Interfaces:**
- Consumes `missingPurchase`, `confirmPurchase` (with `payers: [CAMP]` and `maxQuantity: null`, and the quantity fixed to the listed lines), and `shop_buy_materials`.
- Shown next to `reasonList(check)` when:
  - the reasons include `missing_materials`,
  - `tradingPostLevel(state) ≥ 1`,
  - and `missingPurchase(...).lines.length > 0`.
- Button copy: `Comprar o que falta no Entreposto — {formatPrice(total)}`.
- Under the button, when `unavailable` is non-empty: "Não vende: {names}".
- The confirmation body lists "12 Madeira — 3 Prata e 6 Bronze" lines and the total, with Confirmar/Cancelar.
- It does not start the build.

- [ ] **Step 1:** Extract `shortcutModel(state, catalog, cost, viewer): { label: string; lines: string[]; unavailable: string[] } | null` into `src/ui/buildingDetails.ts`. Test `buildsShortcutForForgeLevel2` (label total "1 Ouro, 3 Prata e 6 Bronze") and `hidesShortcutWithoutTradingPost`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement and wire it in `SlotPanel`.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` pass. Then `npm run dev`: with wood short, click the shortcut, confirm, and see the build button enable.
- [ ] **Step 5:** `git commit -m "feat: add buy-missing shortcut to the building panel"`

### Task 11: Docs and deploy note

**Files:**
- Create: `docs/plans/ENTREPOSTO.md` (short, in the style of `DEPOSITO.md`: where the data lives, commands, the atomic delivery, deploy order)

- [ ] **Step 1:** Write the doc.
- [ ] **Step 2:** `npm test && npm run typecheck && npm run lint && npm run build` → all green.
- [ ] **Step 3:** `git commit -m "docs: describe the entreposto trade system"`
- [ ] **Step 4:** Report to Ítalo the deploy order (`supabase db push` for `20261017000000_shop.sql` → `npm run deploy:functions` → site) and that nothing was pushed.
