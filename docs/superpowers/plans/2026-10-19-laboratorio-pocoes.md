# Laboratório Arcano: bancadas e poções — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Laboratório Arcano (`arcane_lab`) gets a workshop window with brewing stations. Clicking a free station opens the potion recipes for that station type; brewing spends the ingredients (mostly herbs from the Estufa), takes N game days, and collecting delivers the potions into the Materiais.

**Architecture:** Mirror the Estufa exactly. The lab lives in `GameState` (`state.lab`) and changes only through new `GameCommand`s, with pure rules in `src/systems/Lab.ts`. Progress and the "station vanished" rule run inside `passDay` (`src/systems/TimeSystem.ts`). Station layout per level is static data (`src/data/lab.json`) in the `Catalog`. No SQL migration.

**Tech Stack:** TypeScript, zod 4, Vitest, vanilla DOM UI (`el` from `src/ui/dom.ts`), Edge Function bundle (`src/server/catalog.ts`).

**Spec:** `docs/superpowers/specs/2026-10-19-laboratorio-pocoes-design.md`
**Reference implementation to copy patterns from:** `src/systems/Garden.ts`, `src/ui/garden/*`, `docs/plans/ESTUFA.md`, `docs/superpowers/plans/2026-10-17-estufa-jardim.md`.

## Before starting

- [ ] Read the spec, especially "Decisões" (Ítalo answered every open question on 2026-10-19).
- [ ] Read `CLAUDE.local.md`: local commits are fine, **never push, never open PRs, never create remote branches**.
- [ ] Create branch `feat/laboratorio-pocoes` locally; first commit is the spec + this plan (`docs: add arcane lab spec and plan`). Run `npm test` and `npm run build` once to confirm a green baseline.

## Global Constraints

- All UI copy in pt-BR, in `src/i18n/pt-BR.ts` under `t.lab`. Log texts and errors in the same file, next to the garden ones.
- Station types: `alambique`, `caldeirao`, `circulo`. Ids: `alambique-1`…`alambique-4`, `caldeirao-1`, `caldeirao-2`, `circulo-1`.
- Stations per level: nv1 `alambique-1..2`; nv2 `alambique-1..3` + `caldeirao-1`; nv3 `alambique-1..4` + `caldeirao-1..2` + `circulo-1`. No id disappears on an upgrade.
- Progress: reuse `GROWTH_TENTHS_PER_DAY` semantics as `BREW_TENTHS_PER_DAY = 10`. Ready when `progressTenths >= days × 10`.
- Recipe: `{ id, outputId, outputQty 1..9999, ingredients: 1..6 × { materialId, quantity 1..9999 }, stationType, days 1..365, color?, hidden }` (bounds match `cropBase`). zod refine: no duplicate `materialId`, `outputId` not among ingredients, `color` is `hexColor`. The client generates `id` with `newId('recipe')` and sends it in the command (see the comment at `src/commands/schema.ts:26`).
- Hidden recipes: the form creates recipes with `hidden: true`; the master reveals/hides with `lab_recipe_update`. Players never see hidden recipes, and a player `lab_brew` on one fails with `not_found`. The master sees all (badge **Oculta**) and may brew any.
- Brew snapshot stored on the station: `{ recipeId, outputId, outputQty, days, spent, color?, progressTenths }`, where `spent` is what actually left the stock (master without stock spends less than the recipe). Collect/settle read the snapshot, never the live recipe; refunds return `spent`, never the recipe amounts.
- Ingredients come from the shared Materiais stock (`addStock` with negative amounts; it already allows them). Player missing anything → `missing_ingredients`. Master: spends what exists, the rest is free.
- Discard: no refund. Recipe removal or hiding with stations in use: allowed, the brew finishes.
- Potions go into Materiais. No Depot integration.
- `SAVE_VERSION` 9 → 10. Old saves gain `lab: { recipes: [], stations: {} }`.
- The existing `destilar` job on `arcane_lab` stays untouched. A new `brewing` job (Task 8) is in scope: one NPC speeds **every** brew.
- Commits: conventional `feat:`/`test:`/`docs:`/`refactor:`, one per task at least. Never push.

## Review Focus

1. **Material deleted by the master** while a recipe or a brew points at it (output or ingredient). Recipes with missing materials drop out of the recipe tray; collecting a missing output delivers nothing but frees the station; refunding a missing ingredient skips it. → `Lab.test.ts`: `hidesRecipesWhoseMaterialIsGone`, `collectsMissingOutputAsNothing`, `refundSkipsDeletedIngredient`.
2. **Forced downgrade / removal.** Brews in stations that no longer exist: collect if ready, move if a free station of the same type exists, otherwise refund the snapshot `spent`. A master brew made without stock refunds only what was spent. → `settlesOnForcedDowngrade`, `settlesAllStationsWhenRemoved`, `refundsOnlyWhatMasterSpent`.
3. **Upgrade in progress.** Stations come from the level in force (`levelInForce`/`builtLevel`, same helper the garden uses), so `caldeirao-1` is not usable while the nv2 works run. → `refusesStationAboveLevelInForce`.
4. **"Recolher tudo" racing a single collect in another tab.** Only ready stations at apply time; `nothing_changed` when none; never twice. → `collectAllSkipsBrewingAndEmpty`, `collectAllWithNothingReady`.
5. **Edited recipe during a brew** must not change the brew. → `editingRecipeKeepsRunningBrew`, `removingRecipeKeepsRunningBrew`.
6. **Stock race:** two players brew the same herbs at once. The second command is refused with `missing_ingredients` and nothing is spent (spending is all-or-nothing). → `brewSpendsAllOrNothing`.
7. **Hidden recipes** never leak to players: not in the tray, not brewable by command. → `playerCannotBrewHiddenRecipe`, `hidesHiddenRecipesFromPlayers`, `masterSeesHiddenRecipes`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/model/schema.ts` (modify) | `stationTypeSchema`, `stationDefSchema`, `labLayoutSchema`, `recipeSchema`, `brewSchema`, `labSchema`, `state.lab`, log entries, `SAVE_VERSION = 10` |
| `src/data/lab.json` (create) | Station boxes per level (16:10 scene coordinates) |
| `src/model/catalog.ts`, `src/data/gameData.ts`, `src/server/catalog.ts` (modify) | `catalog.lab` + cross-checks |
| `src/systems/SaveSystem.ts` (modify) | `createInitialState` + migration 9→10 |
| `src/systems/testFixtures.ts` (modify) | lab fixtures (recipes, herbs, potion material) |
| `src/systems/Lab.ts` (create) + test | Layout queries, recipe CRUD, brew, collect, discard, progress, settle |
| `src/systems/TimeSystem.ts` (modify) + test | `brewLab` and `settleLab` in `passDay` |
| `src/commands/schema.ts`, `applyCommand.ts` (modify) + test | Lab commands, `PLAYER_COMMANDS`, settle after force/remove |
| `src/systems/outcome.ts` (modify) | New `ActionError`s |
| `src/ui/lab/labViews.ts` (create) + test | Pure view models: summary, station state, recipe options (have/need, Estufa badge) |
| `src/ui/lab/labSceneLayout.ts` (create) + test | Pure scene logic: liquid color hash, stage by progress, popover position, locked stations per level |
| `src/ui/lab/LabScene.ts` (create) | Code-drawn 16:10 workshop scene + station buttons |
| `src/ui/lab/LabWindow.ts` (create) | Window shell, popovers, Recolher tudo, bottom strip, narrow-screen cards, master tab |
| `src/ui/lab/RecipeForm.ts` (create) + test | Master "Receitas" tab (incl. Revelar/Ocultar) |
| `src/model/schema.ts`, `src/systems/NpcWork.ts`, `src/data/buildings.json` (modify) + test | `brewing` job effect (Task 8) |
| `src/ui/SlotPanel.ts`, `src/main.ts` (modify) | Laboratório section + window wiring |
| `src/i18n/pt-BR.ts`, `src/ui/ui.css` (modify) | Copy, log texts, errors, styles |
| `docs/plans/LABORATORIO.md` (create) | System reference, like `ESTUFA.md` |

---

### Task 1: Lab data in the save and catalog

**Files:** `src/model/schema.ts`, `src/model/catalog.ts`, `src/data/gameData.ts`, `src/server/catalog.ts`, `src/systems/SaveSystem.ts`, `src/systems/testFixtures.ts`; create `src/data/lab.json`. Tests: `SaveSystem.test.ts`, `catalog.test.ts`.

- [ ] Add schemas next to the garden ones: `stationTypeSchema = z.enum(['alambique','caldeirao','circulo'])`, `stationDefSchema { id, type, x, y, w, h }` (0..1), `labLayoutSchema { levels: [{ stations }] }`.
- [ ] `recipeSchema` with the bounds and refines listed in Global Constraints (`hidden: z.boolean()`); `brewSchema` (snapshot with `spent` + `progressTenths: positiveInt`); `labSchema { recipes, stations: z.record(stationId, brewSchema) }`; add `lab: labSchema` to `gameStateSchema`.
- [ ] Log entry schemas: `lab_brewed { station, material, ingredients }`, `lab_collected { material, amount }`, `lab_discarded { station, material }`, `lab_ingredients_returned { station, ingredients }`.
- [ ] `SAVE_VERSION = 10`; migration 9→10 adds the empty lab. Write the failing test first (`migrates9to10AddsEmptyLab`).
- [ ] Write `src/data/lab.json` (3 levels, ids per Global Constraints). Lay boxes out so they read well in a 16:10 scene: alambiques along the back wall, caldeirões in the middle, círculo front-center.
- [ ] Wire `catalog.lab` through `parseCatalog`, `gameData.ts` and the server bundle (`src/server/catalog.ts`), exactly like `garden`.
- [ ] Add `labProblems(catalog)` next to `gardenProblems` in `src/model/catalog.ts`: lab.json has as many levels as `arcane_lab`; ids unique per level; an id never changes type between levels; every id of level N exists in level N+1.
- [ ] `catalog.test.ts`: lab.json parses and has no problems; one case per problem above (`noStationVanishesOnUpgrade`, `stationKeepsTypeAcrossLevels`, `labLevelsMatchBuilding`).
- [ ] `npm test` green → commit `feat: add arcane lab data to the save and catalog`.

### Task 2: Lab queries and recipe catalog (master)

**Files:** create `src/systems/Lab.ts` + `Lab.test.ts`; modify `src/systems/outcome.ts`.

- [ ] `ARCANE_LAB_BUILDING_ID = 'arcane_lab'` in `src/model/catalog.ts` (like `HERB_GARDEN_BUILDING_ID`), re-exported by `Lab.ts`.
- [ ] `stationsInForce(state, catalog)`: stations of the level in force of the built lab (reuse the same level helper the garden uses; empty when not built).
- [ ] `recipesFor(state, stationType, isMaster)`: recipes of that type whose output and every ingredient still exist, sorted by output name; hidden ones only for the master.
- [ ] `addRecipe`, `updateRecipe`, `removeRecipe` returning the same `Outcome` shape as `addCrop`/`updateCrop`/`removeCrop`. `not_found` for unknown materials or recipe id.
- [ ] New `ActionError`s: `lab_not_built`, `unknown_station`, `station_busy`, `station_empty`, `wrong_station_type`, `missing_ingredients` (`not_ready`, `not_found`, `nothing_changed` already exist).
- [ ] Tests: CRUD happy paths, unknown material, `hidesRecipesWhoseMaterialIsGone`, `hidesHiddenRecipesFromPlayers`, `masterSeesHiddenRecipes`, `stationsFollowLevelInForce`.
- [ ] Commit `feat: add lab station queries and recipe catalog`.

### Task 3: Brew, collect, discard + commands

**Files:** `Lab.ts`, `Lab.test.ts`, `src/commands/schema.ts`, `src/commands/applyCommand.ts`, `applyCommand.test.ts`, `src/i18n/pt-BR.ts` (errors + log texts).

- [ ] `brew(state, catalog, stationId, recipeId, who)`: checks in order `lab_not_built` → `unknown_station` → `station_busy` → recipe `not_found` (also when a player asks for a hidden recipe) → `wrong_station_type` → stock. Player: every ingredient must be in stock, else `missing_ingredients` and **nothing** is spent. Master: spend `min(stock, need)` of each. Store the snapshot with `spent` (the amounts actually taken; skip zeros) and `progressTenths: 0`. Log `lab_brewed` with `spent`.
- [ ] Spend with `addStock` from `src/systems/Materials.ts` (negative amounts are already allowed).
- [ ] `collect(state, catalog, stationId?)`: single → `station_empty` / `not_ready`; delivers `outputQty` (nothing if the material is gone) and frees the station. Without id: every ready station in force, one summed `lab_collected` per material, `nothing_changed` if none.
- [ ] `discard(state, catalog, stationId)`: `station_empty` if free; frees it, no refund, log `lab_discarded`.
- [ ] Commands in `src/commands/schema.ts`: `lab_recipe_create { recipe }`, `lab_recipe_update { recipeId, recipe }`, `lab_recipe_remove { recipeId }`, `lab_brew { stationId, recipeId }`, `lab_collect { stationId? }`, `lab_discard { stationId }`. Handlers in `applyCommand.ts` next to the garden ones; add `lab_brew`, `lab_collect`, `lab_discard` to `PLAYER_COMMANDS`; register the new errors where `garden_not_built` is registered.
- [ ] Tests (table-driven like `Garden.test.ts`): brew with everything, `brewSpendsAllOrNothing`, master brews without stock (snapshot `spent` = what existed), `playerCannotBrewHiddenRecipe`, master brews hidden recipe, `hidingRecipeKeepsRunningBrew`, wrong type, busy, `refusesStationAboveLevelInForce`, lab not built, collect ready/not ready/empty, `collectsMissingOutputAsNothing`, `collectAllSkipsBrewingAndEmpty`, `collectAllWithNothingReady`, discard, `editingRecipeKeepsRunningBrew`, `removingRecipeKeepsRunningBrew`. `applyCommand.test.ts`: player cannot `lab_recipe_create`; player can brew/collect/discard.
- [ ] Commit `feat: brew, collect and discard potions in the arcane lab`.

### Task 4: Progress and settling stations that vanish

**Files:** `Lab.ts`, `Lab.test.ts`, `src/systems/TimeSystem.ts`, `TimeSystem.test.ts`, `applyCommand.ts`.

- [ ] `brewLab(state, catalog)`: +`BREW_TENTHS_PER_DAY` to every brew in a station in force.
- [ ] `settleLab(state, catalog)`: for brews in stations not in force: ready → collect; brewing → first free station of the same type in force, keeping progress; else refund the snapshot `spent` (skip deleted materials) and log `lab_ingredients_returned`.
- [ ] `passDay` order: NPC work → passive production → `growGarden` → **`brewLab`** → `completeConstructions` → `settleGarden` → **`settleLab`** → NPC settle/missions. Mirror the garden comment explaining why progress runs before the works complete. In `passDay`, `settleLab` is only a safeguard (works only raise levels); the real settling happens after the two commands below.
- [ ] Call `settleLab` after `force_building` and `remove_building`, next to `settleGarden` (`applyCommand.ts:322,328`).
- [ ] Tests: `progressesOneDay`, `readyAfterDays`, `settlesOnForcedDowngrade` (all three branches), `settlesAllStationsWhenRemoved`, `refundSkipsDeletedIngredient`, `refundsOnlyWhatMasterSpent`; `applyCommand.test.ts`: a ready brew in a station removed by `force_building` is collected, not refunded; `TimeSystem.test.ts`: a nv2 work completing that day — brews advanced first, `caldeirao-1` usable only after the day.
- [ ] Commit `feat: advance and settle lab brews each day`.

### Task 5: Pure view models

**Files:** create `src/ui/lab/labViews.ts`, `labViews.test.ts`, `src/ui/lab/labSceneLayout.ts`, `labSceneLayout.test.ts`.

- [ ] `labSummary(views)` → `{ ready, brewing, free }` for "1 pronta · 2 preparando · 1 livre".
- [ ] `stationViews(state, catalog)`: per station in force `{ id, type, index, status: 'free'|'brewing'|'ready', name?, progress 0..1, daysLeft, color }`, plus locked stations of higher levels `{ id, type, unlockLevel }` for the dashed outlines.
- [ ] `recipeOptions(state, catalog, stationType, isMaster)`: per recipe from `recipesFor` `{ recipe, outputName, hidden, ingredients: [{ name, have, need, missing, fromGarden }], canBrew, reason }`. `fromGarden` = some crop has `harvestId === materialId`. Empty list for a player → the tray shows "Nenhuma receita conhecida para esta bancada".
- [ ] `labSceneLayout.ts`: `liquidColor(recipe|brew)` (explicit `color` or stable hash of `outputId`, same hashing style as `cropLook`), `brewStage(progress)` (`'simmer' | 'boil' | 'ready'`), `popoverPosition` (copy the garden logic), `aria label` builder.
- [ ] Tests for each, including `badgesHerbFromGarden`, `masterCanBrewWithoutStock`, `lockedStationsShowUnlockLevel`, `playerTrayEmptyWhenAllHidden`.
- [ ] Commit `feat: add lab view models`.

### Task 6a: Workshop scene and station states

**Files:** create `src/ui/lab/LabScene.ts`, `src/ui/lab/LabWindow.ts` (shell only); modify `src/ui/SlotPanel.ts`, `src/main.ts`, `src/i18n/pt-BR.ts`, `src/ui/ui.css`.

- [ ] **Load the `frontend-design` skill first** and look at `GardenScene.ts`/`GardenWindow.ts`; match their structure, window chrome and animation approach.
- [ ] `SlotPanel.extraSections`: when `placed.buildingId === ARCANE_LAB_BUILDING_ID` and built, a **Laboratório** section with the summary and **Abrir laboratório** (same shape as `gardenSection`). Add `lab: () => void` to the callbacks and wire it in `main.ts`.
- [ ] `LabScene.ts`: 16:10 scene drawn with DOM/CSS (no building art): dark stone floor, back shelves with bottles, candles, warm light. Station looks: **alambique** = wooden table + glass flask + coil, liquid tinted with `liquidColor`; **caldeirão** = iron cauldron over embers; **círculo** = rune ring on the floor rotating, violet palette (`#9b6bff`, `#b48cff`, matching the lab fx). Locked stations dashed with "Caldeirão · Nível 2".
- [ ] States: free (unlit), brewing (bubbles + steam, progress bar, "faltam N dias"), ready (glow + floating flask). Every station is a `<button>` with the aria label from `labSceneLayout`.
- [ ] Re-render only stations whose drawing changed (copy the garden diffing). `prefers-reduced-motion` disables bubbles and runes.
- [ ] Commit `feat: draw the arcane lab workshop and brewing stations`.

### Task 6b: Station interaction

**Files:** `src/ui/lab/LabWindow.ts`, `src/ui/lab/LabScene.ts`, `src/i18n/pt-BR.ts`, `src/ui/ui.css`.

- [ ] Free → recipe tray popover (chips "Hortelã 2/3", red when missing, **Estufa** badge + "Plante na Estufa de Ervas" and an **Abrir jardim** shortcut when the estufa is built; master sees the **Oculta** badge; empty player tray shows "Nenhuma receita conhecida para esta bancada").
- [ ] Brewing → name, progress, **Descartar** with in-popover confirmation. Ready → tap collects, potion icon flies to the **Recolhido** chip (off with `prefers-reduced-motion`). Header **Recolher tudo (N)**. Esc / outside click closes.
- [ ] Bottom strip: **Recolhido** (this session) and **Ingredientes no estoque** (materials that are an ingredient of some recipe the viewer can see).
- [ ] Commit `feat: brew and collect potions from the lab window`.

### Task 6c: Narrow screens + manual check

- [ ] ≤640px: hide the scene, show a card list per station (same actions).
- [ ] Manual check in the browser (`npm run dev`): build the lab, create two herbs + one potion + one recipe as master, reveal it, brew as a player, advance days, collect. Check narrow width.
- [ ] Commit `feat: show lab stations as cards on narrow screens`.

### Task 7: Master "Receitas" tab

**Files:** create `src/ui/lab/RecipeForm.ts` + test; modify `LabWindow.ts`.

- [ ] Tab **Receitas** visible only to the master, listing recipes grouped by station type, with edit/remove (remove with confirmation; note that brews in progress finish anyway), the **Oculta** badge and a **Revelar** / **Ocultar** button (sends `lab_recipe_update` with `hidden` flipped). New recipes start hidden.
- [ ] Form: potion select (materials, category "Poções" first if it exists), ingredient rows (material select + quantity, "+ Ingrediente", remove; max 6; disable already-chosen materials), station type select, days, yield, optional color with live flask preview. Validation messages for duplicates / output among ingredients before sending.
- [ ] Pure form→recipe conversion tested (`RecipeForm.test.ts`), like `CropForm.test.ts`.
- [ ] Commit `feat: let the master manage potion recipes`.

### Task 8: NPC speeds up brewing (approved by Ítalo: one NPC covers every station)

**Files:** `src/model/schema.ts` (`jobEffectSchema`), `src/systems/NpcWork.ts`, `src/data/buildings.json`, tests.

- [ ] New effect `{ type: 'brewing', perDay }`. In `work`, add the worker's yield in tenths (`postYieldTenths`) to every brew in the lab where the post stands; never below 0.
- [ ] Add a second job "Supervisionar preparos" (skill `alchemy`, effect `brewing`) on `arcane_lab` levels 2 and 3. Keep `destilar` unchanged. NPC work runs before `brewLab` in `passDay`, so a supervised brew can be ready a day early: test it.
- [ ] Tests in `NpcWork.test.ts`: good worker speeds every brew, hindering worker slows without going negative, no brews = no effect. Tally/log as `npc_worked` with target the lab.
- [ ] Commit `feat: let alchemists speed up lab brews`.

### Task 9: Docs and deploy note

- [ ] Create `docs/plans/LABORATORIO.md` in the style of `docs/plans/ESTUFA.md` (where it lives, stations table, recipe fields, commands, rules, settle, day order, log, UI, deploy).
- [ ] Update `docs/plans/NPCS.md` with the `brewing` effect and the new post.
- [ ] Final `npm test`, `npm run build`, lint. Commit `docs: describe the arcane lab potion system`.
- [ ] Final report to Ítalo: what changed, choices made, and deploy order, after merging to master: **1) `npm run deploy:functions` from master** (server must know `lab_*` and save v10 before any client sends them; deploying from an older branch overwrites newer server code, as on 2026-10-18), **2) the site**. No `supabase db push`. After deploy, in game: create the **Poções** category and items in Materiais, then the recipes in the **Receitas** tab, and **reveal** the ones players should know.
