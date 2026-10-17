# Estufa de Ervas: jardim e madeira passiva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Estufa de Ervas (`herb_garden`) gets a garden window where the party plants seeds, watches them grow day by day and harvests herbs into the Materiais. It also yields wood every day.

**Architecture:** The garden lives in `GameState` (`state.garden`) and changes only through new `GameCommand`s, with pure rules in `src/systems/Garden.ts`. Growth, passive production and the "plot vanished" rule all run inside `passDay` (`src/systems/TimeSystem.ts`), so server and client agree. The plot layout per level is static data (`src/data/garden.json`) in the `Catalog`. No SQL migration.

**Tech Stack:** TypeScript, zod 4, Vitest, vanilla DOM UI (`el` from `src/ui/dom.ts`), Edge Function bundle (`src/server/catalog.ts`).

**Spec:** `docs/superpowers/specs/2026-10-17-estufa-jardim-design.md`

## Global Constraints

- All UI copy in pt-BR, in `src/i18n/pt-BR.ts` under `t.garden`. Prices shown with `formatPrice`.
- Plot types: `canteiro`, `muda`, `estufa`, `arcana`, `lago`. No glicínia in this delivery.
- Plots per level: nv1 4 canteiros + 4 mudas; nv2 6 canteiros + 4 mudas + `estufa-1`, `estufa-2`; nv3 6 canteiros + 4 mudas + `estufa-1` + `arcana-1` + `lago-1`.
- A bancada (`estufa`/`arcana`) is one plot; the crop's `yield` already counts all 10 pots.
- Growth: `GROWTH_TENTHS_PER_DAY = 10`. A planting is ready when `growthTenths >= days × 10`.
- Common crops are perennial: harvest resets `growthTenths` to 0 and keeps the planting. Rare crops: harvest empties the plot.
- Seed purchase: common crops only, price `crop.price` (CoinBag), **always paid by the camp** (`CAMP`). The master plants for free. The bought seed never touches the stock.
- Rare crops have no price and cannot be bought in the garden (`rare_not_for_sale`).
- Passive wood (`produces`) on `herb_garden` levels: `{ wood: 3 }`, `{ wood: 6 }`, `{ wood: 10 }`.
- `herb_garden` gets no `jobs` (no skill yet). Its `party`/`axis` stay empty: they are Ítalo's to write.
- `SAVE_VERSION` 8 → 9. Old saves gain `garden: { crops: [], plots: {} }`.
- Commits: conventional `feat:`/`test:`/`docs:`/`refactor:` with no ticket (branch `feat/estufa-jardim`). Never push.
- Deploy for the final report: `npm run deploy:functions` → site. No `db push`.

## Review Focus

1. **A material the master deletes** while a crop points at it (as seed or harvest). The garden must not crash: crops with a missing seed or harvest material drop out of the seed list, and harvesting a missing material delivers nothing but still frees or resets the plot. → tests in Task 3 (`hidesCropsWhoseMaterialIsGone`) and Task 4 (`harvestsMissingMaterialAsNothing`).
2. **The master forces the estufa to a lower level, or removes it.** Plantings in plots that no longer exist go through the same rule as an upgrade: harvest if ready, move if there is room, otherwise return the seed. With the building gone, every plot settles. → tests in Task 5 (`settlesOnForcedDowngrade`, `settlesAllPlotsWhenRemoved`).
3. **"Colher tudo" racing a single harvest in another tab.** It must harvest only what is ready at apply time, and answer `nothing_changed` when nothing is. It must never harvest twice. → test in Task 4 (`harvestAllSkipsGrowingAndEmpty`, `harvestAllWithNothingReady`).
4. **Upgrade in progress.** The garden and production use the level in force (`activeLevel`), so `estufa-1` is not plantable while the nv2 works are still running. → tests in Task 2 (`producesAtLevelInForceDuringUpgrade`) and Task 4 (`refusesPlotAboveLevelInForce`).
5. **Camp short of bronze for "Comprar e plantar".** The command is refused with `insufficient_coins`, nothing is planted, and the button is disabled in the view with the shortfall. → tests in Task 4 (`refusesBuyWhenCampIsShort`) and Task 6 (`seedOptionDisabledWhenCampIsShort`).

---

## File Structure

| File                                                                             | Responsibility                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/schema.ts` (modify)                                                   | `plotTypeSchema`, `plotDefSchema`, `gardenLayoutSchema`, `cropSchema`, `plantingSchema`, `gardenSchema`, `state.garden`, `buildingLevelSchema.produces`, log entries, `SAVE_VERSION = 9` |
| `src/data/garden.json` (create)                                                  | Plot boxes per level                                                                                                                                                                     |
| `src/data/buildings.json` (modify)                                               | `produces` on the 3 `herb_garden` levels                                                                                                                                                 |
| `src/model/catalog.ts`, `src/data/gameData.ts`, `src/server/catalog.ts` (modify) | `catalog.garden` + cross-checks                                                                                                                                                          |
| `src/systems/SaveSystem.ts` (modify)                                             | `createInitialState` + migration 8→9                                                                                                                                                     |
| `src/systems/BuildSystem.ts` (modify)                                            | `levelInForce` moved here from `Npcs.ts`                                                                                                                                                 |
| `src/systems/Production.ts` (create) + test                                      | Passive production per day                                                                                                                                                               |
| `src/systems/Materials.ts`, `src/systems/Wallets.ts` (modify)                    | `addStock`, `chargeWallet` moved out of `Shop.ts` for reuse                                                                                                                              |
| `src/systems/Garden.ts` (create) + test                                          | Layout queries, crop CRUD, plant, harvest, clear, growth, settle                                                                                                                         |
| `src/systems/TimeSystem.ts` (modify) + test                                      | Calls production, growth and settle in `passDay`                                                                                                                                         |
| `src/commands/schema.ts`, `applyCommand.ts` (modify) + test                      | Garden commands, permissions, settle after force/remove                                                                                                                                  |
| `src/systems/outcome.ts` (modify)                                                | New `ActionError`s                                                                                                                                                                       |
| `src/ui/garden/gardenViews.ts` (create) + test                                   | Pure view models: summary, plot state, seed options                                                                                                                                      |
| `src/ui/garden/GardenWindow.ts` (create)                                         | Art + hotspots, popover, list on narrow screens, Colher tudo                                                                                                                             |
| `src/ui/garden/CropForm.ts` (create) + test                                      | Master "Cultivos" tab                                                                                                                                                                    |
| `src/ui/SlotPanel.ts`, `src/main.ts` (modify)                                    | Jardim section + window wiring                                                                                                                                                           |
| `src/i18n/pt-BR.ts`, `src/ui/ui.css` (modify)                                    | Copy, log texts, errors, styles                                                                                                                                                          |
| `docs/plans/ESTUFA.md` (create)                                                  | System reference, like `ENTREPOSTO.md`                                                                                                                                                   |

---

### Task 1: Garden data in the save and catalog

**Files:**

- Modify: `src/model/schema.ts`, `src/model/catalog.ts`, `src/data/gameData.ts`, `src/server/catalog.ts`, `src/systems/SaveSystem.ts`, `src/systems/testFixtures.ts`, `src/data/buildings.json`
- Create: `src/data/garden.json`
- Test: `src/systems/SaveSystem.test.ts`, `src/model/catalog.test.ts`

**Interfaces:**

- Produces, in `schema.ts`:

```ts
export const plotTypeSchema = z.enum(['canteiro', 'muda', 'estufa', 'arcana', 'lago']);
const unit = z.number().min(0).max(1);
export const plotDefSchema = z.object({ id: z.string().min(1), type: plotTypeSchema, x: unit, y: unit, w: unit, h: unit });
/** garden.json: one entry per herb_garden level, in order. */
export const gardenLayoutSchema = z.object({ levels: z.array(z.object({ plots: z.array(plotDefSchema) })) });
const cropBase = {
  seedId: z.string().min(1),          // one crop per seed: the seed is the crop's id
  harvestId: z.string().min(1),
  plotType: plotTypeSchema,
  days: z.number().int().min(1).max(365),
  yield: z.number().int().min(1).max(9999),
};
export const cropSchema = z.discriminatedUnion('rare', [
  z.object({ ...cropBase, rare: z.literal(false), price: amountBagSchema }),
  z.object({ ...cropBase, rare: z.literal(true) }),
]);
export const plantingSchema = z.object({ seedId: z.string().min(1), growthTenths: positiveInt });
export const gardenSchema = z.object({ crops: z.array(cropSchema), plots: z.record(z.string(), plantingSchema) });
// gameStateSchema gains: garden: gardenSchema
// buildingLevelSchema gains: produces: amountBagSchema.optional()  (materials per day)
export type PlotType, PlotDef, GardenLayout, Crop, Planting, Garden  // z.infer of the above
```

- `Catalog` gains `readonly garden: GardenLayout`. `SAVE_VERSION = 9`.

- [ ] **Step 1: Write failing tests**
  - `SaveSystem.test.ts`:
    - `startsNewGamesWithAnEmptyGarden`: `createInitialState(catalog).garden` equals `{ crops: [], plots: {} }`.
    - `migratesVersion8SavesWithEmptyGarden`: a v8 fixture without `garden` → ok, `version === 9`, empty garden.
  - `catalog.test.ts`:
    - `rejectsGardenLayoutWithWrongLevelCount`: a layout with 2 levels while `herb_garden` has 3 → problem mentions `garden`.
    - `rejectsDuplicatePlotIdsInALevel`.
    - `rejectsPlotIdReusedWithAnotherType` (same id, different type across levels: ids must keep their type).
- [ ] **Step 2:** `npx vitest run src/systems/SaveSystem.test.ts src/model/catalog.test.ts` → FAIL.
- [ ] **Step 3: Implement**
  - `src/data/garden.json`, values measured on the 768×506 art:

```json
{
  "levels": [
    {
      "plots": [
        { "id": "canteiro-1", "type": "canteiro", "x": 0.309, "y": 0.296, "w": 0.112, "h": 0.079 },
        { "id": "canteiro-2", "type": "canteiro", "x": 0.579, "y": 0.296, "w": 0.111, "h": 0.079 },
        { "id": "canteiro-3", "type": "canteiro", "x": 0.315, "y": 0.553, "w": 0.115, "h": 0.079 },
        { "id": "canteiro-4", "type": "canteiro", "x": 0.573, "y": 0.553, "w": 0.112, "h": 0.075 },
        { "id": "muda-1", "type": "muda", "x": 0.724, "y": 0.573, "w": 0.039, "h": 0.067 },
        { "id": "muda-2", "type": "muda", "x": 0.763, "y": 0.573, "w": 0.039, "h": 0.067 },
        { "id": "muda-3", "type": "muda", "x": 0.799, "y": 0.636, "w": 0.047, "h": 0.059 },
        { "id": "muda-4", "type": "muda", "x": 0.799, "y": 0.696, "w": 0.047, "h": 0.059 }
      ]
    },
    {
      "plots": [
        { "id": "canteiro-1", "type": "canteiro", "x": 0.309, "y": 0.296, "w": 0.112, "h": 0.079 },
        { "id": "canteiro-2", "type": "canteiro", "x": 0.579, "y": 0.296, "w": 0.111, "h": 0.079 },
        { "id": "canteiro-3", "type": "canteiro", "x": 0.316, "y": 0.553, "w": 0.113, "h": 0.079 },
        { "id": "canteiro-4", "type": "canteiro", "x": 0.573, "y": 0.553, "w": 0.112, "h": 0.079 },
        { "id": "canteiro-5", "type": "canteiro", "x": 0.186, "y": 0.563, "w": 0.113, "h": 0.079 },
        { "id": "canteiro-6", "type": "canteiro", "x": 0.703, "y": 0.563, "w": 0.111, "h": 0.079 },
        { "id": "muda-1", "type": "muda", "x": 0.094, "y": 0.407, "w": 0.042, "h": 0.051 },
        { "id": "muda-2", "type": "muda", "x": 0.135, "y": 0.407, "w": 0.042, "h": 0.051 },
        { "id": "muda-3", "type": "muda", "x": 0.094, "y": 0.458, "w": 0.042, "h": 0.051 },
        { "id": "muda-4", "type": "muda", "x": 0.135, "y": 0.458, "w": 0.042, "h": 0.051 },
        { "id": "estufa-1", "type": "estufa", "x": 0.241, "y": 0.043, "w": 0.521, "h": 0.083 },
        { "id": "estufa-2", "type": "estufa", "x": 0.241, "y": 0.13, "w": 0.521, "h": 0.087 }
      ]
    },
    {
      "plots": [
        { "id": "canteiro-1", "type": "canteiro", "x": 0.309, "y": 0.296, "w": 0.112, "h": 0.079 },
        { "id": "canteiro-2", "type": "canteiro", "x": 0.579, "y": 0.296, "w": 0.111, "h": 0.079 },
        { "id": "canteiro-3", "type": "canteiro", "x": 0.316, "y": 0.553, "w": 0.113, "h": 0.079 },
        { "id": "canteiro-4", "type": "canteiro", "x": 0.573, "y": 0.553, "w": 0.112, "h": 0.079 },
        { "id": "canteiro-5", "type": "canteiro", "x": 0.186, "y": 0.563, "w": 0.113, "h": 0.079 },
        { "id": "canteiro-6", "type": "canteiro", "x": 0.703, "y": 0.563, "w": 0.111, "h": 0.079 },
        { "id": "muda-1", "type": "muda", "x": 0.094, "y": 0.407, "w": 0.042, "h": 0.051 },
        { "id": "muda-2", "type": "muda", "x": 0.135, "y": 0.407, "w": 0.042, "h": 0.051 },
        { "id": "muda-3", "type": "muda", "x": 0.094, "y": 0.458, "w": 0.042, "h": 0.051 },
        { "id": "muda-4", "type": "muda", "x": 0.135, "y": 0.458, "w": 0.042, "h": 0.051 },
        { "id": "estufa-1", "type": "estufa", "x": 0.241, "y": 0.049, "w": 0.521, "h": 0.081 },
        { "id": "arcana-1", "type": "arcana", "x": 0.241, "y": 0.134, "w": 0.521, "h": 0.087 },
        { "id": "lago-1", "type": "lago", "x": 0.462, "y": 0.593, "w": 0.085, "h": 0.103 }
      ]
    }
  ]
}
```

- Load it into `catalog.garden` in `gameData.ts` **and** `src/server/catalog.ts` (the Edge Function validates plot ids).
- Add the 3 layout checks to the catalog problems, next to the shop seed check.
- `buildings.json`: `"produces": { "wood": 3 }`, then `6`, then `10` on the `herb_garden` levels.
- `SAVE_MIGRATIONS[8] = (save) => ({ ...save, garden: { crops: [], plots: {} } })`.
- Update the `GameState` builders in `testFixtures.ts`.
- [ ] **Step 4:** `npm test && npm run typecheck` → all pass.
- [ ] **Step 5:** `git commit -m "feat: add garden data to the save and catalog"`

### Task 2: Passive production

**Files:**

- Modify: `src/systems/BuildSystem.ts`, `src/systems/Npcs.ts`, `src/systems/TimeSystem.ts`, `src/model/schema.ts` (log), `src/i18n/pt-BR.ts` (log text)
- Create: `src/systems/Production.ts`, `src/systems/Production.test.ts`
- Test: `src/systems/TimeSystem.test.ts`

**Interfaces:**

- `BuildSystem.ts` produces `export function levelInForce(state: GameState, catalog: Catalog, slotId: string): BuildingLevel | undefined` (moved verbatim from `Npcs.ts`, which now imports it).
- `Production.ts` produces:

```ts
/** Whole units produced so far in an advance, by building id and material id. */
export type ProductionTally = ReadonlyMap<
  string,
  { buildingId: string; materialId: string; amount: number }
>;
export const EMPTY_PRODUCTION: ProductionTally;
/** One day: every slot whose level in force has `produces` adds it to existing materials. */
export function produceOneDay(
  state: GameState,
  catalog: Catalog,
  tally: ProductionTally,
): { state: GameState; tally: ProductionTally };
export function productionLog(
  tally: ProductionTally,
  catalog: Catalog,
  state: GameState,
  day: number,
): LogEntry[];
```

- Log entry `building_produced { buildingId, material: string /* name */, quantity: positive int }`, one per building+material per advance. `pt-BR` log line: "Estufa de Ervas produziu 18 Madeira".
- `passDay` order: wages/work → **production** → constructions → (Task 5 adds growth and settle) → NPCs → missions. `Progress` gains `production: ProductionTally`. `advanceDays` appends `productionLog` next to `tallyLog`.

- [ ] **Step 1:** Tests:
  - `Production.test.ts`:
    - `producesWoodPerLevel` (table: level 1 → 3, 2 → 6, 3 → 10, one day each).
    - `producesAtLevelInForceDuringUpgrade`: `herb_garden` at `level: 2, status: 'building'` → 3 per day.
    - `producesNothingWhileFirstBuilding` (level 1 under construction: level in force 0).
    - `skipsMaterialTheMasterDeleted`: no `wood` in `state.materials` → state unchanged, empty tally.
  - `TimeSystem.test.ts`: `logsProductionOnceForTheWholeAdvance`: 3 days at level 1 → one `building_produced` with `quantity: 9`.
- [ ] **Step 2:** `npx vitest run src/systems/Production.test.ts src/systems/TimeSystem.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Add the material units the same way `NpcWork.produce` does (positive only here).
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** `git commit -m "feat: let buildings produce materials every day"`

### Task 3: Garden queries and crop catalog (master)

**Files:**

- Create: `src/systems/Garden.ts`, `src/systems/Garden.test.ts`
- Modify: `src/systems/outcome.ts`, `src/commands/schema.ts`, `src/commands/applyCommand.ts`, `src/i18n/pt-BR.ts`
- Test: `src/commands/applyCommand.test.ts`

**Interfaces:**

- Produces in `Garden.ts`:

```ts
export const HERB_GARDEN_BUILDING_ID = 'herb_garden';
export const GROWTH_TENTHS_PER_DAY = 10;
export function gardenLevel(state: GameState): number; // builtLevel(state, HERB_GARDEN_BUILDING_ID)
export function plotsInForce(state: GameState, catalog: Catalog): readonly PlotDef[]; // [] at level 0
export function findCrop(state: GameState, seedId: string): Crop | undefined;
export function isReady(crop: Crop, planting: Planting): boolean; // growthTenths >= days * GROWTH_TENTHS_PER_DAY
/** Crops for a plot type whose seed and harvest materials both still exist, by seed name. */
export function cropsFor(state: GameState, plotType: PlotType): Crop[];
export type CropFields = DistributiveOmit<Crop, 'seedId'>; // keep the rare/price union; same local helper type as src/systems/Research.ts:23
export function addCrop(state: GameState, crop: Crop): Outcome;
export function updateCrop(state: GameState, seedId: string, fields: CropFields): Outcome;
export function removeCrop(state: GameState, seedId: string): Outcome;
```

- New `ActionError`s, each added to `COMMAND_ERRORS` and `t.errors`: `'garden_not_built'`, `'unknown_plot'`, `'plot_occupied'`, `'plot_empty'`, `'not_ready'`, `'wrong_plot_type'`, `'no_seed'`, `'rare_not_for_sale'`, `'crop_already_exists'`, `'crop_in_use'`.
- Commands, master only (not in `PLAYER_COMMANDS`):
  - `garden_crop_create { crop: cropSchema }`
  - `garden_crop_update { seedId, crop: <cropSchema without seedId> }`
  - `garden_crop_remove { seedId }`
  - Not logged (like shop edits): return `resources(...)`.

- [ ] **Step 1:** Tests in `Garden.test.ts`:
  - `plotsInForce` table: level 0 → 0 plots; 1 → 8; 2 → 12; 3 → 13; level 2 under upgrade to 3 → 12.
  - `addCrop` table: unknown seed material → `not_found`; unknown harvest material → `not_found`; second crop for the same seed → `crop_already_exists`; valid → ok.
  - `updateCrop`: switching to `rare: true` drops the price; unknown seed → `not_found`.
  - `removeCrop`: `crop_in_use` while a plot holds it; ok after the plot is cleared.
  - `hidesCropsWhoseMaterialIsGone`: `cropsFor` leaves out a crop whose harvest material was removed.
  - `applyCommand.test.ts`: `refusesCropEditsFromPlayers` → `forbidden` for all 3 commands.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the signatures above.
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** `git commit -m "feat: let the master define garden crops"`

### Task 4: Plant, harvest, clear

**Files:**

- Modify: `src/systems/Garden.ts`, `src/systems/Shop.ts`, `src/systems/Materials.ts`, `src/systems/Wallets.ts`, `src/model/schema.ts` (log), `src/commands/schema.ts`, `src/commands/applyCommand.ts`, `src/i18n/pt-BR.ts`
- Test: `Garden.test.ts`, `applyCommand.test.ts`, `Shop.test.ts` (stays green)

**Interfaces:**

- Refactor first, behavior unchanged:
  - `Shop.ts`'s private `addStock` moves to `Materials.ts` as `export function addStock(state: GameState, materialId: string, quantity: number): GameState`.
  - `Shop.ts`'s private `charge` moves to `Wallets.ts` as `export function chargeWallet(state: GameState, catalog: Catalog, payer: WalletRef, costBronze: number): Outcome`.
- Produces in `Garden.ts`:

```ts
export interface PlantOrder {
  plotId: string;
  seedId: string;
  buy: boolean;
}
export function plant(state: GameState, catalog: Catalog, order: PlantOrder, actor: Actor): Outcome;
/** `plotId` undefined harvests every ready plot in force; `nothing_changed` when none is ready. */
export function harvest(state: GameState, catalog: Catalog, plotId: string | undefined): Outcome;
export function clearPlot(state: GameState, catalog: Catalog, plotId: string): Outcome;
```

- `plant` checks in this order: `garden_not_built` → `unknown_plot` (not in `plotsInForce`) → `plot_occupied` → `not_found` (crop or its materials) → `wrong_plot_type`. Then the seed source:
  1. seed stock ≥ 1 → consume 1;
  2. master → free;
  3. otherwise `!buy` → `no_seed`, rare → `rare_not_for_sale`, else `chargeWallet(state, catalog, CAMP, toBronze(crop.price))` (which may fail with `insufficient_coins`).
- Log entries:
  - `garden_planted { plot: string, seed: string /* name */, bronze: positiveInt /* 0 when not bought */ }`
  - `garden_harvested { material: string /* name */, quantity: positive int }`, one per material per command, skipped when the material is gone
  - `garden_cleared { plot, seed }`
- Commands, in `PLAYER_COMMANDS` and for the master:
  - `garden_plant { plotId, seedId, buy: z.boolean() }`
  - `garden_harvest { plotId: z.string().min(1).optional() }`
  - `garden_clear { plotId }`

- [ ] **Step 1:** Table-driven tests in `Garden.test.ts` (fixture: estufa nv1, crop `semente_hortela` → `hortela`, canteiro, 3 days, yield 4, price `{ bronze: 2 }`; rare crop `semente_lunar` → `flor_lunar`, canteiro, 5 days, yield 1):
  - `plant`:
    - `consumesOwnedSeed` (stock 3 → 2, planting with `growthTenths: 0`)
    - `buysCommonSeedFromCamp` (stock 0, buy → camp −2 bronze, stock stays 0)
    - `refusesBuyWhenCampIsShort` → `insufficient_coins`, plot still empty
    - `refusesRareWithoutSeed` → `rare_not_for_sale`
    - `refusesWithoutSeedAndNoBuy` → `no_seed`
    - `masterPlantsForFree`
    - `refusesWrongPlotType` (canteiro crop on `muda-1`)
    - `refusesOccupiedPlot`
    - `refusesPlotAboveLevelInForce` (`estufa-1` at nv1)
    - `refusesWithoutGarden` → `garden_not_built`
  - `harvest`:
    - `perennialResetsGrowth` (+4 hortelã, planting stays at 0)
    - `rareEmptiesPlot`
    - `refusesGrowingPlot` → `not_ready`
    - `refusesEmptyPlot` → `plot_empty`
    - `harvestAllSkipsGrowingAndEmpty`
    - `harvestAllWithNothingReady` → `nothing_changed`
    - `harvestsMissingMaterialAsNothing` (harvest material deleted: plot resets, no stock change, no log line)
    - `logsOneLinePerMaterial` (two ready hortelã plots → one `garden_harvested` with 8)
  - `clearPlot`: empties without harvest and without returning the seed; `plot_empty` on an empty plot.
  - `applyCommand.test.ts`: `playerCanPlantHarvestAndClear`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Do the two moves, run `npx vitest run src/systems/Shop.test.ts` (green), then implement `plant`, `harvest`, `clearPlot`.
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** Two commits: `refactor: share stock and wallet charge helpers` and then `feat: plant, harvest and clear garden plots`.

### Task 5: Growth and settling plots that vanish

**Files:**

- Modify: `src/systems/Garden.ts`, `src/systems/TimeSystem.ts`, `src/commands/applyCommand.ts`, `src/model/schema.ts` (log), `src/i18n/pt-BR.ts`
- Test: `Garden.test.ts`, `TimeSystem.test.ts`, `applyCommand.test.ts`

**Interfaces:**

- Produces in `Garden.ts`:

```ts
/** One day: every planting in a plot in force gains GROWTH_TENTHS_PER_DAY (ready ones keep growing harmlessly). */
export function growGarden(state: GameState, catalog: Catalog): GameState;
/**
 * Plantings in plots outside `plotsInForce` (after an upgrade, a forced level or a removal):
 * ready → harvested; else moved to the first free plot in force of the crop's type, keeping growth;
 * else the seed goes back to the stock. Plantings whose crop is gone are dropped.
 */
export function settleGarden(state: GameState, catalog: Catalog): GameState;
```

- Log entry `garden_seed_returned { seed: string /* name */, quantity: positive int }`. Harvests use `garden_harvested`.
- `passDay`: after `completeConstructions`, run `settleGarden` then `growGarden`. Settling first, so a planting moved in an upgrade still grows that day.
- `applyCommand.ts`: the `force_building` and `remove_building` handlers run `settleGarden` on their result.

- [ ] **Step 1:** Tests:
  - `growGarden`:
    - `growsOneDayPerDay`: hortelã is ready after exactly 3 `advanceDays` and not after 2.
    - `doesNotGrowPlotsOutOfForce`.
  - `settleGarden` table, starting from nv2 with `estufa-2` planted and the garden forced to nv3:
    - ready → harvested and plot gone;
    - growing + `estufa-1` free → moved, `growthTenths` kept;
    - growing + `estufa-1` occupied → seed +1 in stock, `garden_seed_returned`.
  - `settlesOnForcedDowngrade` (nv2 → nv1 by `force_building`: `canteiro-5` growing moves to a free canteiro 1–4).
  - `settlesAllPlotsWhenRemoved` (`remove_building`: ready harvested, growing seeds returned, `plots` empty).
  - `keepsMudaPlantingsAcrossUpgrade` (nv1 → nv2 upgrade completes: `muda-1` keeps its growth, no log line).
  - `TimeSystem.test.ts`: `settlesGardenWhenUpgradeCompletes`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck` pass.
- [ ] **Step 5:** `git commit -m "feat: grow garden plots daily and settle them on level changes"`

### Task 6: Garden window (players)

**Files:**

- Create: `src/ui/garden/gardenViews.ts`, `src/ui/garden/gardenViews.test.ts`, `src/ui/garden/GardenWindow.ts`
- Modify: `src/ui/SlotPanel.ts`, `src/main.ts`, `src/i18n/pt-BR.ts`, `src/ui/ui.css`

**Interfaces:**

- Consumes: `plotsInForce`, `cropsFor`, `findCrop`, `isReady`, `GROWTH_TENTHS_PER_DAY`, `campShortfall`/`walletOf(CAMP)`, `toBronze`, `pickArtFile`/`artFileName` (`src/map/buildingArt.ts`; the art is `herb_garden.outer[.lvN].png` in `BUILDING_ART_DIR`).
- Produces in `gardenViews.ts`:

```ts
export type PlotView =
  | { kind: 'empty'; plot: PlotDef }
  | {
      kind: 'growing';
      plot: PlotDef;
      crop: Crop;
      harvestName: string;
      daysLeft: number;
      progress: number; /* 0..1 */
    }
  | { kind: 'ready'; plot: PlotDef; crop: Crop; harvestName: string };
export function plotViews(state: GameState, catalog: Catalog): PlotView[];
export function gardenSummary(views: readonly PlotView[]): {
  ready: number;
  growing: number;
  empty: number;
};
export type SeedAction = 'plant' | 'buy' | 'rare_locked' | 'camp_short';
export interface SeedOption {
  crop: Crop;
  seedName: string;
  harvestName: string;
  owned: number;
  action: SeedAction;
  priceBronze: number | null;
  shortBronze: number | null;
}
export function seedOptions(
  state: GameState,
  catalog: Catalog,
  plotType: PlotType,
  actor: Actor,
): SeedOption[];
```

- `daysLeft = ceil((days × 10 − growthTenths) / 10)`.
- `seedOptions` lists **every** `cropsFor(plotType)`, including those with 0 seeds. `action`: owned ≥ 1 or master → `plant`; rare → `rare_locked`; camp short → `camp_short`; else `buy`.
- `GardenWindow` follows `ShopWindow`: a dialog with `open()` that subscribes to the game store.
  - Art at the level in force, with one absolutely positioned `<button>` per plot (`left/top/width/height` in % from the plot box).
  - Click → popover:
    - empty: seed list with `t.garden.plant` / `t.garden.buyAndPlant(formatPrice)` / the disabled rare hint / the disabled shortfall;
    - growing: progress bar + `t.garden.daysLeft(n)` + Arrancar;
    - ready: Colher + Arrancar.
  - Header: **Colher tudo**, disabled when `ready === 0`.
  - Below 640px wide: the art hides and a card list of the same `PlotView`s shows instead.
  - Ready plots get a CSS glow. On `arcana`, use the glow color `#d8ff8a` from the building `fx`.
  - Every action sends its command through the store and shows refusals with `t.errors`.
- `SlotPanel.extraSections`: `HERB_GARDEN_BUILDING_ID` → a Jardim card with `t.garden.counts(summary)` + `button(t.garden.open, this.windows.garden, { primary: true })`. `main.ts` wires `garden: () => gardenWindow.open()` next to `shop`.

- [ ] **Step 1:** Tests in `gardenViews.test.ts`:
  - `daysLeftRoundsUp` (3-day crop at 15 tenths → 2)
  - `summaryCountsEachState`
  - `listsSeedsWithZeroStock`
  - `seedOptionActions` table: owned → plant; common 0 → buy; rare 0 → rare_locked; master with 0 rare → plant
  - `seedOptionDisabledWhenCampIsShort` (camp 1 bronze, price 2 → `camp_short`, `shortBronze: 1`)
- [ ] **Step 2:** `npx vitest run src/ui/garden` → FAIL.
- [ ] **Step 3:** Implement the views, then the window, the panel section and the wiring.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` pass. Then use the `run` skill: open the game locally, build or force an estufa nv1/nv2/nv3, and check that every hotspot sits on its bed or row. Adjust `garden.json` if a box is off and note it in the commit.
- [ ] **Step 5:** `git commit -m "feat: add the garden window to the herb greenhouse"`

### Task 7: Master "Cultivos" tab

**Files:**

- Create: `src/ui/garden/CropForm.ts`, `src/ui/garden/CropForm.test.ts`
- Modify: `src/ui/garden/GardenWindow.ts`, `src/i18n/pt-BR.ts`, `src/ui/ui.css`

**Interfaces:**

- Consumes: `addCrop`/`updateCrop`/`removeCrop` commands (Task 3), the master session (as `ShopWindow` reads it), the price input from `ShopItemForm` (reuse its coin fields; do not copy them).
- Produces: `export function cropFormValues(form: CropDraft): { ok: true; crop: Crop } | { ok: false; reason: 'missing_material' | 'empty_price' }` and the tab UI.
- Tabs **Jardim | Cultivos**, the second shown only to the master.
- Cultivos lists the crops (seed → harvest, type, days, yield, Rara or price) with Editar/Remover.
- The form uses selects for the seed and harvest materials. Seed options are materials without a crop yet; both lists are grouped by category so "Sementes" and "Ervas" stand out. Plus a plot type select, days, yield, a Rara checkbox, and a price that is hidden when Rara is checked. Salvar stays disabled until valid.

- [ ] **Step 1:** Tests: `cropFormValues` table: no seed → `missing_material`; common with zero price → `empty_price`; rare ignores the price; valid common → crop with `price`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test && npm run typecheck && npm run lint` pass. Using `run`: as master, create a common and a rare crop, plant both as a player, advance days, harvest.
- [ ] **Step 5:** `git commit -m "feat: let the master manage crops from the garden window"`

### Task 8: Docs and deploy note

**Files:**

- Create: `docs/plans/ESTUFA.md` (same shape as `docs/plans/ENTREPOSTO.md`: where it is stored, commands table, rules, settle rule, worker hook, deploy order)

- [ ] **Step 1:** Write it, then `npx prettier --write docs/plans/ESTUFA.md`.
- [ ] **Step 2:** `npm test && npm run typecheck && npm run lint && npm run check:functions` all pass (the bundle carries `garden.json`).
- [ ] **Step 3:** `git commit -m "docs: describe the herb garden system"`
- [ ] **Step 4:** Final report to Ítalo: deploy = `npm run deploy:functions` → site, no `db push`. Save 8→9. Remind him to create the Sementes/Ervas categories and the crops in game.
