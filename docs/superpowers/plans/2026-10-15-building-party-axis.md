# Building Party & Axis Abilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace each building level's single `effect` text with two text fields (`party`, `axis`), and add a "Detalhes" sheet showing every level side by side.

**Architecture:** Data-only change in `buildings.json` + `buildingLevelSchema`; `BonusSystem.activeBonuses` splits accumulated texts into `party`/`axis`. A new UI module `src/ui/buildingDetails.ts` holds a pure `levelFacts()` (tested) and the DOM builders (`abilityColumns`, `buildingDetails`) reused by `SlotPanel` and `InfoDrawer`.

**Tech Stack:** TypeScript, Zod 4, Vitest (node env, no DOM), Vite, Phaser (untouched).

**Spec:** `docs/superpowers/specs/2026-10-15-building-party-axis-design.md`

## Global Constraints

- `party` and `axis` are plain strings, required on every level, empty allowed (`z.string()`).
- All 48 levels ship with `"party": ""` and `"axis": ""`; old `effect` strings are deleted.
- No mechanical Axis buffs in this plan (phase 2).
- Empty text renders as `a definir` in muted color.
- UI text in pt-BR via `src/i18n/pt-BR.ts`; code comments in English (repo convention).
- DOM built with `el()` from `src/ui/dom.ts` (text nodes only, never innerHTML).
- Never `git push`; commit locally after each task (`CLAUDE.local.md`).
- Test names: 3rd-person verbs, no "should".

## Review Focus

1. Re-render while "Detalhes" is open (any store change, e.g. day advance) — the sheet stays open. Covered by keeping open ids in `SlotPanel.openDetails` (manual check, Task 3).
2. Phone width (~360px) — Party/Axis columns stack instead of overflowing. CSS media query in Task 2, manual check in Task 3.
3. A level with both texts empty in "Bônus ativos" — card shows `a definir`, not an empty list. Test on `activeBonuses` skipping empties (Task 1) + render branch (Task 2).
4. Building-wide `requires` (e.g. armory needs forge 1) shows on level 1 only, level-specific `requires` on its own level. Test in Task 2.
5. Hand-edited `buildings.json` missing `party`/`axis` on a level — `npm test` fails pointing at the entry. Test in Task 1.

---

### Task 1: Data model — `party`/`axis` replace `effect`

**Files:**
- Modify: `src/model/schema.ts:84-91` (`buildingLevelSchema`)
- Modify: `src/data/buildings.json` (all 48 levels)
- Modify: `src/systems/BonusSystem.ts:6-27`
- Modify: `src/systems/testFixtures.ts:40-135` (every `effect: 'x1'` on a level)
- Modify: `src/systems/BonusSystem.test.ts:6-42`
- Modify: `src/model/catalog.test.ts` (add one test)
- Modify: `src/ui/SlotPanel.ts:175-179,265-278` (minimal compile fix, replaced in Task 2)
- Modify: `src/ui/InfoDrawer.ts:190` (minimal compile fix, replaced in Task 2)
- Modify: `README.md:425-460` (example JSON)

**Interfaces:**
- Produces: `BuildingLevel` now has `party: string; axis: string` (no `effect`).
- Produces: `ActiveBonus` = `{ buildingId; name; level; party: string[]; axis: string[]; count }` — texts of levels 1..level, empty strings dropped.

- [ ] **Step 1: Update fixtures and write failing tests**

In `src/systems/testFixtures.ts`, replace every level `effect: 'h1'` style line with party/axis. Mapping:

```ts
// heart level 1
party: 'h1', axis: '',
// heart level 2
party: 'h2', axis: 'h2 axis',
// forge level 1 / 2
party: 'f1', axis: 'f1 axis',
party: '', axis: '',
// armory
party: 'a1', axis: '',
// barracks
party: 'b1', axis: '',
party: 'b2', axis: '',
// guild
party: 'g1', axis: '',
party: 'g2', axis: '',
```

(Job `effect: { type: ... }` objects stay untouched — only level-level `effect` strings change.)

Replace the two `activeBonuses` tests in `src/systems/BonusSystem.test.ts`:

```ts
describe('activeBonuses', () => {
  it('accumulates party and axis texts of finished levels in catalog order', () => {
    const state = makeState({
      slots: {
        outer_n: { buildingId: 'forge', level: 2, status: 'done' },
        core: { buildingId: 'heart', level: 2, status: 'done' },
      },
    });
    expect(activeBonuses(state, testCatalog)).toEqual([
      { buildingId: 'heart', name: 'Coração', level: 2, party: ['h1', 'h2'], axis: ['h2 axis'], count: 1 },
      { buildingId: 'forge', name: 'Forja', level: 2, party: ['f1'], axis: ['f1 axis'], count: 1 },
    ]);
  });

  it('skips buildings still under their first construction and keeps the old level during upgrades', () => {
    const state = makeState({
      slots: {
        outer_n: { buildingId: 'forge', level: 1, status: 'building', startedOnDay: 1, completesOnDay: 4 },
        core: { buildingId: 'heart', level: 2, status: 'building', startedOnDay: 1, completesOnDay: 4 },
      },
    });
    expect(activeBonuses(state, testCatalog)).toEqual([
      { buildingId: 'heart', name: 'Coração', level: 1, party: ['h1'], axis: [], count: 1 },
    ]);
  });
});
```

Add to `src/model/catalog.test.ts` inside `describe('shipped game data', …)`:

```ts
  it('rejects a building level without its party and axis texts', () => {
    const [first, ...rest] = rawGameData.buildings;
    const [level, ...levels] = first.levels;
    const { party: _party, ...withoutParty } = level;
    const broken = { ...first, levels: [withoutParty, ...levels] };
    expect(() => parseCatalog({ ...rawGameData, buildings: [broken, ...rest] })).toThrow();
  });

  it('ships every level with party and axis texts, empty meaning "a definir"', () => {
    const levels = gameData.buildings.flatMap((b) => b.levels);
    expect(levels.every((l) => typeof l.party === 'string' && typeof l.axis === 'string')).toBe(true);
  });
```

(If `rawGameData.buildings` is typed as possibly empty and destructuring complains, guard with `if (!first || !level) throw new Error('no buildings');` before use — no `!`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/BonusSystem.test.ts src/model/catalog.test.ts`
Expected: FAIL — `testCatalog` parse throws (`effect` required / `party` unknown is stripped) or `activeBonuses` returns `effects`.

- [ ] **Step 3: Change the schema**

In `src/model/schema.ts` `buildingLevelSchema`, replace `effect: z.string().min(1),` with:

```ts
  /** What the level gives the party at the RPG table; empty until the master writes it. */
  party: z.string(),
  /** Base buffs, plain text for now (mechanical buffs come later); empty until written. */
  axis: z.string(),
```

- [ ] **Step 4: Migrate `buildings.json`**

Run once:

```bash
node -e "const fs=require('fs');const p='src/data/buildings.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));for(const b of d)b.levels=b.levels.map(({effect,...l})=>({...l,party:'',axis:''}));fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n')" && npx prettier --write src/data/buildings.json
```

Check: `grep -c '"party": ""' src/data/buildings.json` → `48`; `grep -c '"effect": "' src/data/buildings.json` → `0` (job effects are objects, `"effect": {`).

- [ ] **Step 5: Update `activeBonuses`**

In `src/systems/BonusSystem.ts`, replace the `effects` field doc + declaration with:

```ts
  /** Party texts of every level reached so far (levels accumulate); unwritten ones left out. */
  party: string[];
  /** Axis texts of every level reached so far; unwritten ones left out. */
  axis: string[];
```

and the body line `const effects = …` plus the returned object with:

```ts
    const reached = def.levels.slice(0, level);
    const party = reached.map((l) => l.party).filter(Boolean);
    const axis = reached.map((l) => l.axis).filter(Boolean);
    const count = Object.values(state.slots).filter(
      (placed) => placed.buildingId === def.id && activeLevel(placed) >= 1,
    ).length;
    return [{ buildingId: def.id, name: def.name, level, party, axis, count }];
```

- [ ] **Step 6: Minimal compile fixes in the UI (replaced in Task 2)**

`src/ui/SlotPanel.ts:178`: `this.stat(t.panel.currentEffect, activeLevelDef.party)`
`src/ui/SlotPanel.ts:276`: `this.stat(t.panel.effect, level.party)`
`src/ui/InfoDrawer.ts:190`: `el('ul', { class: 'effects' }, ...[...bonus.party, ...bonus.axis].map((text) => el('li', {}, text))),`

- [ ] **Step 7: README example**

In `README.md` "Como adicionar uma estrutura nova", replace each `"effect": "…"` line of the stables example with:

```json
         "party": "Montarias comuns custam metade.",
         "axis": ""
```

(second level: `"party": "Viagens a partir da Axis levam 1 dia a menos.", "axis": ""`), and add a bullet after the `requires` bullet:

```md
   - `party` é o texto para a mesa de RPG e `axis` o buff da base. Os dois são obrigatórios; `""` aparece como "a definir".
```

- [ ] **Step 8: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/model/schema.ts src/data/buildings.json src/systems/BonusSystem.ts src/systems/BonusSystem.test.ts src/systems/testFixtures.ts src/model/catalog.test.ts src/ui/SlotPanel.ts src/ui/InfoDrawer.ts README.md
git commit -m "feat: split building level effects into party and axis texts"
```

---

### Task 2: "Detalhes" sheet and Party/Axis display

**Files:**
- Create: `src/ui/buildingDetails.ts`
- Create: `src/ui/buildingDetails.test.ts`
- Modify: `src/i18n/pt-BR.ts` (`panel` block ~line 64; new `details` block after it)
- Modify: `src/ui/SlotPanel.ts` (renderEmpty, renderOccupied, levelStats)
- Modify: `src/ui/InfoDrawer.ts:160-192` (renderBonuses)
- Modify: `src/ui/ui.css` (after `.effects` block ~line 532)

**Interfaces:**
- Consumes: `BuildingLevel.party/axis`, `ActiveBonus.party/axis` (Task 1); `jobEffectText(effect, tenthsPerDay, ctx)` and `TextContext` from `src/i18n/pt-BR.ts`; `textContext(catalog, state)` from `src/ui/format.ts`.
- Produces:
  - `levelFacts(def: BuildingDef, levelIndex: number, ctx: TextContext): string[]`
  - `abilityColumns(level: Pick<BuildingLevel, 'party' | 'axis'>): HTMLElement`
  - `buildingDetails(options: DetailsOptions): HTMLDetailsElement` with
    `interface DetailsOptions { def: BuildingDef; ctx: TextContext; currentLevel: number; open: boolean; onToggle: (open: boolean) => void; costOf: (level: BuildingLevel) => HTMLElement }`

- [ ] **Step 1: Add the texts**

In `src/i18n/pt-BR.ts`, inside `panel`, delete `effect: 'Efeito',` (keep `currentEffect`). After the `panel` block add:

```ts
  details: {
    toggle: 'Detalhes',
    level: (level: number) => `Nível ${level}`,
    party: 'Party',
    axis: 'Axis',
    unwritten: 'a definir',
    requires: (building: string, minLevel: number) => `Requer ${building} nv. ${minLevel}`,
    post: (name: string, effect: string) => `Posto ${name}: ${effect}`,
    postBase: (name: string, effect: string) =>
      `Posto ${name}: ${effect} (base, cresce com a perícia do NPC)`,
    housing: (capacity: number) => `Moradia para ${capacity} NPCs`,
  },
```

- [ ] **Step 2: Write the failing test**

`src/ui/buildingDetails.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findBuilding } from '../model/catalog';
import { makeState, testCatalog } from '../systems/testFixtures';
import { levelFacts } from './buildingDetails';
import { textContext } from './format';

const ctx = textContext(testCatalog, makeState());

function facts(buildingId: string, levelIndex: number): string[] {
  const def = findBuilding(testCatalog, buildingId);
  if (!def) throw new Error(`no ${buildingId} in testCatalog`);
  return levelFacts(def, levelIndex, ctx);
}

describe('levelFacts', () => {
  it.each([
    { building: 'forge', index: 0, lines: ['Posto Forjar: +1,0 Ferro por dia (base, cresce com a perícia do NPC)'] },
    {
      building: 'forge',
      index: 1,
      lines: ['Requer Coração nv. 1', 'Posto Forjar: +2,0 Ferro por dia (base, cresce com a perícia do NPC)'],
    },
    { building: 'armory', index: 0, lines: ['Requer Forja nv. 1'] },
    { building: 'heart', index: 1, lines: ['Posto Rezar: bênção'] },
    { building: 'barracks', index: 1, lines: ['Moradia para 3 NPCs'] },
    { building: 'guild', index: 0, lines: [] },
    { building: 'guild', index: 5, lines: [] },
  ])('lists $building level $index as $lines', ({ building, index, lines }) => {
    expect(facts(building, index)).toEqual(lines);
  });

  it('shows the building-wide requirement on level 1 only', () => {
    const def = findBuilding(testCatalog, 'armory');
    if (!def) throw new Error('no armory');
    const twoLevels = { ...def, levels: [...def.levels, ...def.levels] };
    expect(levelFacts(twoLevels, 1, ctx)).toEqual([]);
  });
});
```

(`findBuilding` is exported from `src/model/catalog.ts` — SlotPanel imports it. If `ctx.material('iron')` in `testCatalog` reads differently than `Ferro`, run once and copy the actual material name into the expectations; `t.tenths(10)` is `1,0` per `jobEffectText` tests in `pt-BR.test.ts`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/ui/buildingDetails.test.ts`
Expected: FAIL — cannot resolve `./buildingDetails`.

- [ ] **Step 4: Implement `src/ui/buildingDetails.ts`**

```ts
import { jobEffectText, t, type TextContext } from '../i18n/pt-BR';
import type { BuildingDef, BuildingLevel, JobDef } from '../model/schema';
import { el } from './dom';

export interface DetailsOptions {
  def: BuildingDef;
  ctx: TextContext;
  /** Level in force (0 when not built); its block is highlighted. */
  currentLevel: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** Cost line, checked against the current stock by the caller. */
  costOf: (level: BuildingLevel) => HTMLElement;
}

/**
 * Requirements, posts and housing a level brings. The building-wide requirement
 * shows on level 1 only: it is met before anything stands.
 */
export function levelFacts(def: BuildingDef, levelIndex: number, ctx: TextContext): string[] {
  const level = def.levels[levelIndex];
  if (!level) return [];
  const requires = [...(levelIndex === 0 ? (def.requires ?? []) : []), ...(level.requires ?? [])];
  return [
    ...requires.map((r) => t.details.requires(ctx.building(r.building), r.minLevel)),
    ...(level.jobs ?? []).map((job) => postText(job, ctx)),
    ...(level.housing ? [t.details.housing(level.housing.capacity)] : []),
  ];
}

/** A bonus post reads as its own text; the others show the yield of an NPC with skill 0. */
function postText(job: JobDef, ctx: TextContext): string {
  const { effect } = job;
  if (effect.type === 'bonus') return t.details.post(job.name, effect.text);
  return t.details.postBase(job.name, jobEffectText(effect, effect.perDay * 10, ctx));
}

/** Party and Axis side by side (stacked on phones); an unwritten text reads "a definir". */
export function abilityColumns(level: Pick<BuildingLevel, 'party' | 'axis'>): HTMLElement {
  return el(
    'div',
    { class: 'abilities' },
    abilityColumn(t.details.party, level.party),
    abilityColumn(t.details.axis, level.axis),
  );
}

function abilityColumn(label: string, text: string): HTMLElement {
  return el(
    'div',
    { class: 'abilities__column' },
    el('span', { class: 'stat__label' }, label),
    el('p', { class: text ? 'abilities__text' : 'abilities__text is-unwritten' }, text || t.details.unwritten),
  );
}

/** "Detalhes": every level with its abilities, cost, time and facts. */
export function buildingDetails(options: DetailsOptions): HTMLDetailsElement {
  const node = el(
    'details',
    { class: 'details', open: options.open },
    el('summary', { class: 'details__toggle' }, t.details.toggle),
    ...options.def.levels.map((level, index) => levelBlock(options, level, index)),
  );
  node.addEventListener('toggle', () => options.onToggle(node.open));
  return node;
}

function levelBlock(options: DetailsOptions, level: BuildingLevel, index: number): HTMLElement {
  const facts = levelFacts(options.def, index, options.ctx);
  const isCurrent = index + 1 === options.currentLevel;
  return el(
    'section',
    { class: isCurrent ? 'details__level is-current' : 'details__level' },
    el('h4', { class: 'details__title' }, t.details.level(index + 1)),
    abilityColumns(level),
    el('p', { class: 'stat' }, el('span', { class: 'stat__label' }, t.panel.cost), options.costOf(level)),
    el(
      'p',
      { class: 'stat' },
      el('span', { class: 'stat__label' }, t.panel.time),
      level.buildTime === 0 ? t.instant : t.days(level.buildTime),
    ),
    facts.length > 0 && el('ul', { class: 'effects' }, ...facts.map((fact) => el('li', {}, fact))),
  );
}
```

If `JobDef` is not exported from `schema.ts`, add `export type JobDef = z.infer<typeof jobDefSchema>;` next to `JobEffect` (~line 703).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/buildingDetails.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire into `SlotPanel`**

In `src/ui/SlotPanel.ts`:

1. Import: `import { abilityColumns, buildingDetails } from './buildingDetails';`
2. Field: `/** Buildings whose "Detalhes" is open, so re-renders keep it open. */ private readonly openDetails = new Set<string>();`
3. Add method:

```ts
  private details(def: BuildingDef, currentLevel: number, state: GameState): HTMLElement {
    return buildingDetails({
      def,
      ctx: textContext(this.store.catalog, state),
      currentLevel,
      open: this.openDetails.has(def.id),
      onToggle: (open) => (open ? this.openDetails.add(def.id) : this.openDetails.delete(def.id)),
      costOf: (level) => this.costList(level.cost, state),
    });
  }
```

4. `renderEmpty`: after `this.reasonList(check),` insert `this.details(def, 0, state),` (before the Build button).
5. `renderOccupied`: replace the `currentEffect` const with

```ts
    const currentEffect = activeLevelDef
      ? el('div', {}, el('h3', { class: 'section-title' }, t.panel.currentEffect), abilityColumns(activeLevelDef))
      : el('p', { class: 'panel__hint' }, t.panel.notYetActive);
    const details = this.details(def, activeLevel(placed), state);
```

and append `details` as the last child of the summary card in all three return branches (building: second card `el('div', { class: 'card' }, currentEffect, details)`; max level: after the maxLevel hint; upgradable: `el('div', { class: 'card' }, summary, currentEffect, details)`).
6. `levelStats`: replace `this.stat(t.panel.effect, level.party),` with `abilityColumns(level),`.

- [ ] **Step 7: Bonuses tab in `InfoDrawer`**

In `src/ui/InfoDrawer.ts` import `import type { ActiveBonus } from '../systems/BonusSystem';` (merge with the existing import) and replace the `el('ul', { class: 'effects' }, …)` child from Task 1 with `...this.bonusTexts(bonus),`. Add:

```ts
  /** Party and Axis texts reached so far; a building with none written reads "a definir". */
  private bonusTexts(bonus: ActiveBonus): HTMLElement[] {
    const groups = [
      { label: t.details.party, texts: bonus.party },
      { label: t.details.axis, texts: bonus.axis },
    ].filter((group) => group.texts.length > 0);
    if (groups.length === 0) return [el('p', { class: 'panel__hint' }, t.details.unwritten)];
    return groups.map(({ label, texts }) =>
      el(
        'div',
        {},
        el('span', { class: 'stat__label' }, label),
        el('ul', { class: 'effects' }, ...texts.map((text) => el('li', {}, text))),
      ),
    );
  }
```

- [ ] **Step 8: Styles**

Append after the `.effects` block in `src/ui/ui.css`:

```css
.abilities {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.abilities__text {
  margin: 2px 0 0;
  font-size: 15px;
  white-space: pre-line;
}

.abilities__text.is-unwritten {
  color: var(--muted);
  font-style: italic;
}

@media (max-width: 420px) {
  .abilities {
    grid-template-columns: 1fr;
  }
}

.details__toggle {
  cursor: pointer;
  color: var(--gold);
  font-weight: 700;
}

.details[open] > .details__toggle {
  margin-bottom: 8px;
}

.details__level {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid rgba(212, 175, 55, 0.18);
}

.details__level.is-current {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.details__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 15px;
  color: var(--gold-soft);
}
```

`white-space: pre-line` lets the master write multi-line texts with `\n` in the JSON.

- [ ] **Step 9: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS. `grep -rn "level.effect\|\.effects\b" src/ui src/systems --include=*.ts` → no building-level hits left (job `post.job.effect` is fine).

- [ ] **Step 10: Commit**

```bash
git add src/ui/buildingDetails.ts src/ui/buildingDetails.test.ts src/i18n/pt-BR.ts src/ui/SlotPanel.ts src/ui/InfoDrawer.ts src/ui/ui.css src/model/schema.ts
git commit -m "feat: add the building details sheet with party and axis per level"
```

---

### Task 3: Server bundle check and manual verification

**Files:** none expected (generated `supabase/functions/_shared/game.js` only if tracked and changed).

- [ ] **Step 1: Build and parity**

Run: `npm run build && npm run build:functions && npm run parity`
Expected: build OK; parity reports identical output. Then `git status --short`: if `supabase/functions/_shared/game.js` changed and is tracked, commit it in Step 4.

- [ ] **Step 2: Manual check in the browser**

Run: `npm run dev`, open the app, then:
1. Click an empty outer slot → each card shows Party/Axis "a definir" for level 1 and a "Detalhes" toggle; open Forja's: 3 level blocks, costs, days, "Posto Forjar…", level 2 "Requer Coração da Axis nv. 1".
2. With Detalhes open, advance a day (or any action) → it stays open.
3. Click a built building → "Efeito atual" shows the two columns; Detalhes highlights the current level.
4. Drawer → "Bônus ativos" → built buildings show "a definir".
5. Narrow the window to ~360px → Party and Axis stack.

- [ ] **Step 3: Temporary text sanity check**

Put `"party": "Teste\nlinha 2"` on forge level 1 in `buildings.json`, confirm it renders on two lines in Detalhes and in "Bônus ativos", then revert the file (`git checkout src/data/buildings.json`).

- [ ] **Step 4: Commit (only if Step 1 changed tracked files)**

```bash
git add supabase/functions/_shared/game.js
git commit -m "chore: rebuild the game function bundle"
```
