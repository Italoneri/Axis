/**
 * A recipe is the character.json the generator exports ("Export to Clipboard
 * (JSON)" or inside its ZIP): a body type plus one selection per slot.
 */
import { z } from 'zod';
import type { Catalog, CatalogItem } from './catalog';

const selectionSchema = z.object({
  itemId: z.string().min(1),
  subId: z.number().int().nonnegative().nullable().optional(),
  variant: z.string().optional(),
  recolor: z.string().optional(),
  name: z.string().optional(),
});
export type Selection = z.infer<typeof selectionSchema>;

/** Other fields the site writes (layers, credits, UI flags) are kept but not needed. */
export const recipeSchema = z.looseObject({
  version: z.literal(2),
  bodyType: z.string().min(1),
  selections: z.record(z.string(), selectionSchema),
});
export type Recipe = z.infer<typeof recipeSchema>;

const LISTED_OPTIONS = 40;

export function parseRecipe(json: string): Recipe {
  return recipeSchema.parse(JSON.parse(json));
}

/** Every problem in the recipe, each naming the piece and the options that exist. */
export function recipeProblems(recipe: Recipe, catalog: Catalog): string[] {
  if (!catalog.bodyTypes.includes(recipe.bodyType)) {
    return [`bodyType "${recipe.bodyType}" does not exist; options: ${list(catalog.bodyTypes)}`];
  }
  return Object.entries(recipe.selections).flatMap(([key, selection]) => {
    const item = catalog.items.get(selection.itemId);
    if (item === undefined) {
      const similar = similarIds(selection.itemId, catalog);
      return [
        `selections.${key}: item "${selection.itemId}" does not exist; similar: ${list(similar)}`,
      ];
    }
    return selectionProblems(recipe.bodyType, key, selection, item).map(
      (problem) => `selections.${key} (${item.id}): ${problem}`,
    );
  });
}

function selectionProblems(
  bodyType: string,
  key: string,
  selection: Selection,
  item: CatalogItem,
): string[] {
  if (!item.bodyTypes.includes(bodyType)) {
    return [`not made for bodyType "${bodyType}"; made for: ${list(item.bodyTypes)}`];
  }
  const subId = selection.subId ?? null;
  const recolor = subId === null ? item.recolors[0] : item.recolors[subId];
  if (subId !== null && recolor === undefined) {
    return [`subId ${subId} does not exist; the item has ${item.recolors.length} recolor(s)`];
  }
  const expectedKey = (subId === null ? null : recolor?.typeName) ?? item.typeName;
  return [
    key === expectedKey ? null : `must sit under selections.${expectedKey}`,
    optionProblem('variant', selection.variant ?? '', item.variants),
    optionProblem('recolor', selection.recolor ?? '', recolor?.colors ?? []),
  ].filter((problem) => problem !== null);
}

/** Empty is right only when the item has no options of that kind. */
function optionProblem(
  kind: 'variant' | 'recolor',
  value: string,
  options: readonly string[],
): string | null {
  if (options.length === 0) {
    return value === '' ? null : `${kind} "${value}" given, but the item has no ${kind}s`;
  }
  if (options.includes(value)) return null;
  const given = value === '' ? `a ${kind} is required` : `${kind} "${value}" does not exist`;
  return `${given}; options: ${list(options)}`;
}

function similarIds(itemId: string, catalog: Catalog): string[] {
  const words = itemId.split('_').filter((word) => word.length > 2);
  return [...catalog.items.keys()].filter((id) => words.some((word) => id.includes(word)));
}

function list(options: readonly string[]): string {
  if (options.length === 0) return '(none)';
  const shown = options.slice(0, LISTED_OPTIONS).join(', ');
  const hidden = options.length - LISTED_OPTIONS;
  return hidden > 0 ? `${shown} … and ${hidden} more` : shown;
}

/**
 * spritesheets/ folders the recipe draws from. A `${…}` placeholder is filled by
 * the site from other selections, so the folder is cut just before it.
 */
export function spritesheetFolders(recipe: Recipe, catalog: Catalog): string[] {
  const folders = Object.values(recipe.selections).flatMap((selection) => {
    const layers = catalog.items.get(selection.itemId)?.layers ?? [];
    return layers.flatMap((layer) => {
      const folder = layer[recipe.bodyType];
      return folder === undefined ? [] : [folder.split('${')[0] ?? ''];
    });
  });
  return [...new Set(folders.filter((folder) => folder.length > 0))].sort();
}

export function selectedItemIds(recipe: Recipe): string[] {
  return [...new Set(Object.values(recipe.selections).map((selection) => selection.itemId))];
}
