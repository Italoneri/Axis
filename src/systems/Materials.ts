import type { AmountBag, Category, GameState, Material, Materials } from '../model/schema';
import {
  addCategory,
  idError,
  nameError,
  removeCategory,
  renameCategory,
  type CategoriesResult,
} from './Categories';
import { fail, ok, withLog, type ActionError, type Outcome } from './outcome';

export interface MaterialFields {
  name: string;
  category: string;
  icon?: string | undefined;
  description?: string | undefined;
}

export interface MaterialNeeds {
  /** Known materials the group has too little of, with how much is missing. */
  missing: AmountBag;
  /** Ids not in the catalog anymore (or never added): the requirement is unavailable. */
  unknown: string[];
}

export function findMaterial(materials: Materials, id: string): Material | undefined {
  return materials.items.find((m) => m.id === id);
}

export function totalMaterialUnits(materials: Materials): number {
  return materials.items.reduce((sum, m) => sum + m.quantity, 0);
}

export function materialNeeds(materials: Materials, need: AmountBag): MaterialNeeds {
  const entries = Object.entries(need).filter(([, amount]) => amount > 0);
  const unknown = entries.filter(([id]) => !findMaterial(materials, id)).map(([id]) => id);
  const missing = Object.fromEntries(
    entries.flatMap(([id, amount]) => {
      const material = findMaterial(materials, id);
      const shortfall = material ? amount - material.quantity : 0;
      return shortfall > 0 ? [[id, shortfall]] : [];
    }),
  );
  return { missing, unknown };
}

/** Caller must check `materialNeeds` first; quantities are floored at zero as a safety net. */
export function consumeMaterials(materials: Materials, need: AmountBag): Materials {
  return {
    ...materials,
    items: materials.items.map((m) => {
      const amount = need[m.id] ?? 0;
      return amount > 0 ? { ...m, quantity: Math.max(0, m.quantity - amount) } : m;
    }),
  };
}

export function addMaterial(
  state: GameState,
  fields: MaterialFields & { id: string; quantity: number },
): Outcome {
  const { materials } = state;
  const error = idError(fields.id, materials.items) ?? fieldsError(materials, fields);
  if (error) return fail(error);
  const material: Material = {
    ...cleanFields(fields),
    id: fields.id,
    quantity: Math.max(0, Math.floor(fields.quantity)),
  };
  return ok(
    withLog(setMaterials(state, { ...materials, items: [...materials.items, material] }), {
      day: state.day,
      kind: 'material_added',
      material: material.name,
    }),
  );
}

/** Renames and recategorizes without logging: only quantity changes affect the game. */
export function updateMaterial(state: GameState, id: string, fields: MaterialFields): Outcome {
  const { materials } = state;
  if (!findMaterial(materials, id)) return fail('not_found');
  const error = fieldsError(materials, fields, id);
  if (error) return fail(error);
  const items = materials.items.map((m) =>
    m.id === id ? { ...cleanFields(fields), id, quantity: m.quantity } : m,
  );
  return ok(setMaterials(state, { ...materials, items }));
}

export function removeMaterial(state: GameState, id: string): Outcome {
  const { materials } = state;
  const material = findMaterial(materials, id);
  if (!material) return fail('not_found');
  return ok(
    withLog(
      setMaterials(state, { ...materials, items: materials.items.filter((m) => m.id !== id) }),
      { day: state.day, kind: 'material_removed', material: material.name },
    ),
  );
}

/** Adds (positive) or removes (negative) units, never below zero; logs what changed. */
export function adjustMaterial(state: GameState, id: string, delta: number): Outcome {
  const { materials } = state;
  const material = findMaterial(materials, id);
  if (!material) return fail('not_found');
  const quantity = Math.max(0, material.quantity + Math.trunc(delta));
  const applied = quantity - material.quantity;
  if (applied === 0) return ok(state);
  const items = materials.items.map((m) => (m.id === id ? { ...m, quantity } : m));
  return ok(
    withLog(setMaterials(state, { ...materials, items }), {
      day: state.day,
      kind: 'material_adjusted',
      material: material.name,
      delta: applied,
    }),
  );
}

export function addMaterialCategory(state: GameState, category: Category): Outcome {
  return withCategories(state, addCategory(state.materials.categories, category));
}

export function renameMaterialCategory(state: GameState, id: string, name: string): Outcome {
  return withCategories(state, renameCategory(state.materials.categories, id, name));
}

export function removeMaterialCategory(state: GameState, id: string): Outcome {
  const isInUse = state.materials.items.some((m) => m.category === id);
  return withCategories(state, removeCategory(state.materials.categories, id, isInUse));
}

export function setMaterials(state: GameState, materials: Materials): GameState {
  return { ...state, materials };
}

function withCategories(state: GameState, result: CategoriesResult): Outcome {
  if (!result.ok) return fail(result.error);
  return ok(setMaterials(state, { ...state.materials, categories: result.categories }));
}

function fieldsError(
  materials: Materials,
  fields: MaterialFields,
  ownId?: string,
): ActionError | null {
  if (!materials.categories.some((c) => c.id === fields.category)) return 'not_found';
  return nameError(fields.name, materials.items, ownId);
}

/** Drops blank optional fields so saves stay tidy and placeholders kick in. */
function cleanFields(fields: MaterialFields): Omit<Material, 'id' | 'quantity'> {
  const icon = fields.icon?.trim();
  const description = fields.description?.trim();
  return {
    name: fields.name.trim(),
    category: fields.category,
    ...(icon ? { icon } : {}),
    ...(description ? { description } : {}),
  };
}
