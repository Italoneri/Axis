import type { Category } from '../model/schema';
import type { ActionError } from './outcome';

// Shared by material and research categories, and by every id generated from a name.

export type CategoriesResult =
  { ok: true; categories: Category[] } | { ok: false; error: ActionError };

/** "Lâminas Rúnicas" → "laminas_runicas". */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Slug of the name, suffixed (_2, _3…) when already taken. */
export function uniqueId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name) || 'item';
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** Checks a display name against the others, ignoring case and surrounding spaces. */
export function nameError(
  name: string,
  others: readonly { id: string; name: string }[],
  ownId?: string,
): ActionError | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty_name';
  const clash = others.some(
    (other) => other.id !== ownId && other.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return clash ? 'duplicate_name' : null;
}

export function addCategory(categories: readonly Category[], name: string): CategoriesResult {
  const error = nameError(name, categories);
  if (error) return { ok: false, error };
  const id = uniqueId(
    name,
    categories.map((c) => c.id),
  );
  return { ok: true, categories: [...categories, { id, name: name.trim() }] };
}

export function renameCategory(
  categories: readonly Category[],
  id: string,
  name: string,
): CategoriesResult {
  if (!categories.some((c) => c.id === id)) return { ok: false, error: 'not_found' };
  const error = nameError(name, categories, id);
  if (error) return { ok: false, error };
  return {
    ok: true,
    categories: categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)),
  };
}

/** Only empty categories can go, so nothing is ever left without one. */
export function removeCategory(
  categories: readonly Category[],
  id: string,
  isInUse: boolean,
): CategoriesResult {
  if (!categories.some((c) => c.id === id)) return { ok: false, error: 'not_found' };
  if (isInUse) return { ok: false, error: 'category_not_empty' };
  return { ok: true, categories: categories.filter((c) => c.id !== id) };
}
