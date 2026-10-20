# Estufa e Laboratório usando o Depósito como estoque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crops (seed, harvest) and recipes (output, ingredients) can point either at a Material or at an item of the group Depósito. Planting and brewing spend from the linked depot item; harvesting, collecting and refunds add to it. Game state and depot change together, atomically.

**Architecture:** Introduce `StockRef = { source: 'material', materialId } | { source: 'depot', itemId }`. `applyCommand` stays pure and returns, besides the new state, a list of depot stock moves `{ itemId, delta, mode }`. Online, the Edge Function commits state + moves in one SQL function (`commit_game_stock`, modelled on `commit_shop_purchase`) that locks the item rows and refuses on shortage. Offline, the same rule runs in TypeScript (`applyStock`) on the local depot. UI reads the already-loaded, realtime group depot for display only.

**Tech Stack:** TypeScript, zod 4, Vitest, Supabase (Postgres + RLS + plpgsql), Edge Function bundle, vanilla DOM UI.

**Spec:** `docs/superpowers/specs/2026-10-19-estoque-no-deposito-design.md`
**Patterns to copy:** `commit_shop_purchase` (`supabase/migrations/20261017000000_shop.sql`), `GameDb.commitPurchase` + `memoryDb`, `deliverToDepot` (`src/systems/Depot.ts`), the `shop_purchased` change in `applyCommand.ts` and `main.ts`.

## Before starting

- [ ] Read the spec. Read `CLAUDE.local.md`: local commits only, **never push, never PRs, never remote branches**.
- [ ] Branch `feat/estoque-no-deposito`. `npm test` + `npm run build` green baseline.
- [ ] Map every reader of `seedId`, `harvestId`, `outputId`, `materialId` (in crop/recipe/brew/planting context) with grep, and list them in the task notes. This refactor touches all of them.

## Global Constraints

- `StockRef` lives in `src/model/schema.ts`; helpers in a new `src/systems/Stock.ts`: `sameRef`, `refKey` (`m:<id>` / `d:<id>`), `refName(ref, state, depot)`, `refQuantity(ref, state, depot)`, `refExists(ref, state, depot)`.
- Only items of the **group** depot (`ownerId === null`) may be linked or moved. Anything else behaves as missing.
- Depot item quantity becomes **0..99_999** (zod + SQL check). Moves never go below 0 nor above 99_999 (positive moves clamp at the limit).
- Move modes: player spend = `strict`; master spend = `clamp`; every gain = positive delta. Moves are summed per item before leaving `applyCommand`.
- Materials stay validated inside `applyCommand` exactly as today.
- `SAVE_VERSION` 10 → 11 with the migration described in the spec. Crops get their own `id` (`newId`; migrated = old `seedId`); plantings store `cropId`.
- Log entries keep a **name snapshot** of the ref.
- No `depot_changed` entries for these automatic moves.
- UI copy pt-BR in `src/i18n/pt-BR.ts`. Commits conventional, at least one per task. Never push.

## Review Focus

1. **Atomicity.** A refused stock move must leave both game and depot untouched, online (SQL rollback) and offline (check before committing either store). → `handler.test.ts`: `stockShortCommitsNothing`; `supabase/tests/stock.test.sql`: `rollsBackOnShortage`; store test `offlineShortageLeavesBothStores`.
2. **Race on the last seed.** Two players plant with 1 seed left: exactly one succeeds. SQL locks rows (`select … for update`) in a stable order (by item id) to avoid deadlocks. → `stock.test.sql`: `secondSpendIsRefused`.
3. **Private / trashed items.** A move on an item with `owner_id is not null` or `deleted_at is not null`: spend → `stock_missing`; gain → skipped and logged as lost. → `applyStockRefusesPrivateItem`, `gainOnTrashedItemIsLost`.
4. **Old saves.** Every crop, planting, recipe and brew from v10 migrates to material refs and keeps working with no master action. → `SaveSystem.test.ts`: `migrates10to11`.
5. **Advance never refused for stock.** `passDay` only generates positive moves. → `TimeSystem.test.ts`: `settleRefundsGoToDepotItem`.
6. **Master clamp.** Master brewing with 1 of 3 depot herbs spends 1, item ends at 0, brew starts. → `Lab.test.ts`: `masterClampsDepotSpend`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/model/schema.ts` (modify) | `stockRefSchema`, crop/planting/recipe/brew/portion schemas, log entry name snapshots, `SAVE_VERSION = 11` |
| `src/systems/Stock.ts` (create) + test | Ref helpers; `StockMove` type; `sumMoves` |
| `src/systems/Depot.ts` (modify) + test | quantity 0..limit; `applyStock(depot, moves, now) → { ok, depot } \| { ok: false, error: 'stock_short' \| 'stock_missing', itemId }`; item 0 allowed in `item_create`/`item_adjust`/`item_update` |
| `src/systems/SaveSystem.ts` (modify) + test | migration 10→11 |
| `src/systems/Garden.ts`, `src/systems/Lab.ts` (modify) + tests | use refs; return moves for depot refs |
| `src/systems/TimeSystem.ts` (modify) + test | collect moves from settle/harvest into the day outcome |
| `src/commands/applyCommand.ts`, `src/commands/schema.ts` (modify) + test | outcomes carry `stock: StockMove[]`; crop/recipe command payloads with refs |
| `src/server/gameDb.ts`, `memoryDb.ts`, `handler.ts` (modify) + tests | `commitWithStock`; map SQL statuses to replies |
| `src/online/SupabaseRepository.ts` or wherever `commitPurchase` is implemented (modify) | call the new RPC |
| `supabase/migrations/20261019000000_depot_stock.sql` (create) | quantity check 0..99999; `commit_game_stock` |
| `supabase/tests/stock.test.sql` (create) | SQL tests |
| `src/store.ts`, `src/depotStore.ts`, `src/main.ts` (modify) | offline atomic apply; optimistic depot update online |
| `src/ui/stock/StockPicker.ts` (create) + test | grouped select (Depósito do grupo / Materiais) + "+ Criar no Depósito" |
| `src/ui/garden/CropForm.ts`, `src/ui/lab/RecipeForm.ts` (modify) + tests | use `StockPicker` |
| `src/ui/garden/*Views.ts`, `src/ui/lab/labViews.ts` (modify) + tests | read quantities through `Stock.ts` with the depot snapshot |
| `src/ui/depot/depotViews.ts`, `DepotWindow.ts` (modify) + tests | 🔗 badge, "×0 em falta", confirm removing a linked item |
| `docs/plans/ESTUFA.md`, `LABORATORIO.md`, `DEPOSITO.md` (modify) | docs |

---

### Task 1: StockRef, depot quantity 0 and `applyStock`

- [ ] `stockRefSchema` (discriminated union on `source`) + `Stock.ts` helpers with tests.
- [ ] `StockMove = { itemId: string; delta: number; mode: 'strict' | 'clamp' }`; `sumMoves` merges by item (a clamp anywhere on an item keeps clamp only if every negative part is clamp; mixing is a bug → throw in dev, test it).
- [ ] `Depot.ts`: `quantitySchema` min 0; `item_adjust`/`item_create`/`item_update` accept 0. Update existing tests that asserted 1 as the minimum.
- [ ] `applyStock(depot, moves, now)`: group + live items only; strict shortage → `stock_short`; missing/private/trashed on a negative move → `stock_missing`; positive on missing → skipped, reported in `lost: itemId[]`; clamp at 0 and at `QUANTITY_LIMIT`; sets `updatedAt`. Pure, all-or-nothing.
- [ ] Tests: `applyStockStrictShort`, `applyStockClamp`, `applyStockCapsAtLimit`, `applyStockRefusesPrivateItem`, `gainOnTrashedItemIsLost`, `allOrNothing`.
- [ ] Commit `feat: add stock refs and depot stock moves`.

### Task 2: Schemas and save migration 10→11

- [ ] Crop: `{ id, seed: StockRef, harvest: StockRef, plotType, days, yield, rare, price?, look? }`. Planting: `{ cropId, growthTenths }`.
- [ ] Portion: `{ ref: StockRef, quantity }`. Recipe: `output: StockRef`, `ingredients: Portion[]`. Brew: `output: StockRef`, `spent: Portion[]`. Rewrite the refines with `sameRef`.
- [ ] Log entries for garden/lab: add `name` snapshots where they used to carry a material id.
- [ ] Migration 10→11 exactly as the spec. `migrates10to11` covers crops, plots, recipes, brews and an empty lab/garden.
- [ ] Commit `feat: migrate crops and recipes to stock refs`.

### Task 3: Garden and Lab rules return stock moves

- [ ] Rule outcomes gain `stock: StockMove[]`. Material refs keep today’s logic; depot refs produce moves instead of touching state.
- [ ] Garden: plant spends seed (`strict` player / `clamp` master; bought seed = no move); harvest adds; settle refund adds; crop CRUD by `id` (`garden_crop_update/remove` take `cropId`); `crop_in_use` checks `cropId`. One crop per seed ref is still enforced (`crop_already_exists` compares refs).
- [ ] Lab: brew spends each ingredient by its source (materials checked in state, depot via moves); `spent` records what the command asked for (`clamp` reality is decided at commit time — store the requested amounts and document it); collect adds output; settle refunds `spent`.
- [ ] `recipesFor`/`cropsFor` filter out refs that do not exist **in state** (materials) only; depot existence is a UI concern (Task 6) because rules cannot see the depot.
- [ ] Tests mirroring the existing ones for depot refs and mixed recipes; `masterClampsDepotSpend` asserts a `clamp` move.
- [ ] Commit `feat: let garden and lab spend and fill depot items`.

### Task 4: Commands, time and the server commit

- [ ] `applyCommand` outcome: `{ ok, state, logged, change, stock }`. `passDay` aggregates moves from harvest-on-settle and refunds.
- [ ] Migration `20261019000000_depot_stock.sql`: alter the `depot_items.quantity` check to `between 0 and 99999`; `commit_game_stock(target_game, expected_revision, next_state, acting_user, acting_name, command, entries, moves jsonb) returns text`. Body: call `commit_game_update` (false → `'conflict'`); `select … from depot_items where game_id = target_game and id = any(...) order by id for update`; for each move: negative on missing/private/trashed → `raise exception using errcode = 'P0001', message = 'stock_missing'`; strict shortage → `'stock_short'`; else `update quantity = least(99999, greatest(0, quantity + delta)), updated_at = now()`. Catch the two custom errors at the end and return them (the exception rolls the whole function back). `security definer`, `search_path = ''`, grant only `service_role`, like the shop function.
- [ ] `supabase/tests/stock.test.sql`: success, `rollsBackOnShortage` (state revision unchanged), `secondSpendIsRefused`, private item, trashed item, cap at limit.
- [ ] `GameDb.commitWithStock` + Supabase implementation + `memoryDb` (in-memory depot using `applyStock`). Handler: non-empty `stock` → `commitWithStock`; map `stock_short` → 422 `{ error: 'missing_ingredients' | 'no_seed' }` by command type, `stock_missing` → 422 `{ error: 'stock_missing' }`, `conflict` → 409. Purchases keep `commitPurchase` (a command never has both).
- [ ] `handler.test.ts`: `stockShortCommitsNothing`, `stockMissingRefused`, `stockSuccessWritesBoth`, `conflictWins`.
- [ ] Commit `feat: commit game and depot stock together on the server`.

### Task 5: Client stores (offline atomic, online optimistic)

- [ ] Offline: before accepting a command with `stock`, run `applyStock` on the local depot; on failure refuse the command with the mapped error and touch neither store; on success save both.
- [ ] Online: apply the moves optimistically to the depot store; on refusal/conflict roll back the optimistic depot change together with the game state (follow how `store.ts` rolls back today). Realtime will then confirm.
- [ ] Toasts for `stock_missing` / mapped shortage errors in pt-BR.
- [ ] Tests: `offlineShortageLeavesBothStores`, `offlineSuccessUpdatesBoth`, optimistic rollback.
- [ ] Commit `feat: apply depot stock moves in the client stores`.

### Task 6: StockPicker and the master forms

- [ ] `src/ui/stock/StockPicker.ts`: one `<select>` with `<optgroup>` per group-depot section (item name + "×N") and one "Materiais" group per material category; value = `refKey`. Shows a warning row when the current ref points at a removed depot item.
- [ ] "+ Criar no Depósito": small inline form (nome, seção existente ou "+ Nova seção", tipo `pocao`/`outro`), sends `section_create` if needed then `item_create` with quantity 0 through the depot store, then selects the new item. Requires the depot to be loaded; if not, the button is disabled with the reason.
- [ ] `CropForm`: semente and colheita pickers. `RecipeForm`: poção and every ingredient row. Duplicate detection with `sameRef`.
- [ ] Automatic look/color hash from `refKey` for depot refs (keep material behaviour unchanged so existing crops do not change color).
- [ ] Tests for the pure picker model and form→payload conversion.
- [ ] Commit `feat: link crops and recipes to depot items in the master forms`.

### Task 7: Garden, Lab and Depot views

- [ ] Garden and Lab windows subscribe to the depot store; views get `(state, catalog, depot)` and use `refQuantity`/`refName`/`refExists`. Hide from players crops/recipes whose depot ref is missing; master sees them flagged.
- [ ] "Sementes no estoque" / "Ervas no estoque" list both sources.
- [ ] Depot: `linkedUses(state, itemId)` (pure, tested) → badge 🔗 with "Semente de …", "Colheita de …", "Poção de …", "Ingrediente de N receitas"; "×0 em falta" style; removing a linked item asks for confirmation listing the uses.
- [ ] Manual check (`npm run dev`, offline mode): create section "porções" + item "porção de cavalo" from the recipe form, brew, advance, collect → depot shows ×N; plant from a depot seed until 0; refusal on the last seed from two tabs (online, if a local Supabase is available).
- [ ] Commit `feat: show depot stock in the garden, lab and depot windows`.

### Task 8: Docs and deploy note

- [ ] Update `docs/plans/ESTUFA.md`, `LABORATORIO.md`, `DEPOSITO.md` (StockRef, quantity 0, moves, SQL function, save v11).
- [ ] `npm test`, `npm run build`, lint, `supabase test db` if available. Commit `docs: describe depot-backed stock for garden and lab`.
- [ ] Final report to Ítalo with the deploy order: **1) `supabase db push`**, **2) `npm run deploy:functions`**, **3) the site**. Old crops and recipes keep using materials; relink them in the forms whenever he wants.
