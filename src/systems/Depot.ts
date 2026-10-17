import { z } from 'zod';
import type { Actor } from '../commands/schema';
import { depotItemKindSchema, type DepotChange } from '../model/schema';
import { MASTER_AUTHOR, normalizeForSearch } from './Archive';

// Depósito: sections and items kept outside the GameState, like the
// Arquivo (see docs/plans/DEPOSITO.md). A section belongs to the group
// (`ownerId` null) or to one character's private area (`ownerId` = the
// character id); its items follow it. Pure rules, the same offline and online.

/** Building whose side panel opens the depot once built. */
export const DEPOT_BUILDING_ID = 'armory';
export const NAME_LIMIT = 120;
export const ITEM_NOTES_LIMIT = 2_000;
export const QUANTITY_LIMIT = 99_999;

const recordId = z.string().regex(/^[a-z0-9_-]{1,64}$/);
const author = z.string().min(1);
const timestamp = z.string().min(1);
/** null: the group's shared depot; a character id: that character's private area. */
const ownerSchema = z.string().min(1).max(64).nullable();
const quantitySchema = z.number().int().min(1).max(QUANTITY_LIMIT);

export const itemKindSchema = depotItemKindSchema;

export const depotSectionSchema = z.object({
  id: recordId,
  name: z.string().trim().min(1).max(NAME_LIMIT),
  /** An emoji, shown before the name. */
  icon: z.string().max(16).optional(),
  ownerId: ownerSchema,
  order: z.number().int(),
  authorId: author,
  /** When it went to the trash; null while in use. */
  deletedAt: timestamp.nullable(),
});

export const depotItemSchema = z.object({
  id: recordId,
  sectionId: recordId,
  name: z.string().trim().min(1).max(NAME_LIMIT),
  kind: itemKindSchema,
  quantity: quantitySchema,
  notes: z.string().max(ITEM_NOTES_LIMIT),
  order: z.number().int(),
  authorId: author,
  editedBy: author.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.nullable(),
});

export const depotSchema = z.object({
  sections: z.array(depotSectionSchema),
  items: z.array(depotItemSchema),
});

export type ItemKind = z.infer<typeof itemKindSchema>;
export type DepotSection = z.infer<typeof depotSectionSchema>;
export type DepotItem = z.infer<typeof depotItemSchema>;
export type Depot = z.infer<typeof depotSchema>;
export type ItemFields = Pick<DepotItem, 'name' | 'kind' | 'quantity' | 'notes'>;

export const EMPTY_DEPOT: Depot = { sections: [], items: [] };
export const ITEM_KINDS = itemKindSchema.options;

export type DepotParse = { ok: true; depot: Depot } | { ok: false; error: string };

/** Checks an untrusted depot (localStorage, an imported save). */
export function parseDepot(json: unknown): DepotParse {
  const result = depotSchema.safeParse(json);
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) };
  return { ok: true, depot: result.data };
}

// ---------------------------------------------------------------- commands

const direction = z.enum(['up', 'down']);
const sectionFields = { name: z.string(), icon: z.string().max(16).optional() };
const itemFields = {
  name: z.string(),
  kind: itemKindSchema,
  // Checked by the rules, so a bad amount is reported as such, not as a bad command.
  quantity: z.number().int(),
  notes: z.string(),
};

const command = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...shape });

export const depotCommandSchema = z.discriminatedUnion('type', [
  command('section_create', { id: recordId, ownerId: ownerSchema, ...sectionFields }),
  command('section_update', { sectionId: recordId, ...sectionFields }),
  command('section_shift', { sectionId: recordId, direction }),
  command('section_remove', { sectionId: recordId }),
  command('section_restore', { sectionId: recordId }),
  command('item_create', { id: recordId, sectionId: recordId, ...itemFields }),
  command('item_update', { itemId: recordId, ...itemFields }),
  /** Quick + / - on the item card. */
  command('item_adjust', { itemId: recordId, delta: z.number().int() }),
  command('item_move', { itemId: recordId, sectionId: recordId }),
  command('item_shift', { itemId: recordId, direction }),
  command('item_remove', { itemId: recordId }),
  command('item_restore', { itemId: recordId }),
  command('trash_empty', {}),
]);

export type DepotCommand = z.infer<typeof depotCommandSchema>;
export type DepotCommandType = DepotCommand['type'];

export type DepotError =
  | 'empty_name'
  | 'duplicate_name'
  | 'duplicate_id'
  | 'not_found'
  | 'category_not_empty'
  | 'forbidden'
  | 'too_long'
  | 'invalid_quantity'
  | 'invalid_command'
  /** Offline, a player must pick their character before writing. */
  | 'no_author';

export interface DepotContext {
  viewer: Actor;
  /** ISO timestamp for createdAt / updatedAt / deletedAt. */
  now: string;
}

export type DepotOutcome =
  /** `change` is null when nothing should be logged (a no-op or something private). */
  { ok: true; depot: Depot; change: DepotChange | null } | { ok: false; error: DepotError };

/** Validates the untrusted command, then applies it for `viewer`. A no-op keeps the same depot. */
export function applyDepotCommand(depot: Depot, input: unknown, ctx: DepotContext): DepotOutcome {
  const parsed = depotCommandSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_command');
  const command = parsed.data;
  const authorId = depotAuthorOf(ctx.viewer);
  if (!authorId) return fail('no_author');
  return run(command.type, command, { depot, ctx, authorId });
}

// ---------------------------------------------------------------- queries

export function depotAuthorOf(viewer: Actor): string | undefined {
  return viewer.role === 'master' ? MASTER_AUTHOR : viewer.characterId;
}

/** The group's depot is everyone's; a private area only its owner's (and the master's). */
export function canSeeArea(viewer: Actor, ownerId: string | null): boolean {
  if (ownerId === null || viewer.role === 'master') return true;
  return viewer.characterId !== undefined && viewer.characterId === ownerId;
}

/** What `viewer` may know about: players never get another character's private area. */
export function visibleDepot(depot: Depot, viewer: Actor): Depot {
  if (viewer.role === 'master') return depot;
  const sections = depot.sections.filter((section) => canSeeArea(viewer, section.ownerId));
  const ids = new Set(sections.map((section) => section.id));
  return { sections, items: depot.items.filter((item) => ids.has(item.sectionId)) };
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

/** Sections in use, in display order; with `ownerId` given, only that area's. */
export function activeSections(depot: Depot, ownerId?: string | null): DepotSection[] {
  return depot.sections
    .filter(
      (section) =>
        section.deletedAt === null && (ownerId === undefined || section.ownerId === ownerId),
    )
    .sort(byOrder);
}

/** A section's items in display order. */
export function sectionItems(depot: Depot, sectionId: string): DepotItem[] {
  return sortItems(depot.items.filter((i) => i.sectionId === sectionId && i.deletedAt === null));
}

export function sortItems(items: readonly DepotItem[]): DepotItem[] {
  return [...items].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/** Owners of the private areas that hold something, sections in the trash included. */
export function privateOwners(depot: Depot): string[] {
  return [...new Set(depot.sections.flatMap((s) => (s.ownerId === null ? [] : [s.ownerId])))];
}

/** Sections and items in use, for the building panel. */
export function depotCounts(depot: Depot): { sections: number; items: number } {
  const sectionIds = new Set(activeSections(depot).map((section) => section.id));
  const items = depot.items.filter((i) => i.deletedAt === null && sectionIds.has(i.sectionId));
  return { sections: sectionIds.size, items: items.length };
}

export function trashedSections(depot: Depot): DepotSection[] {
  return depot.sections.filter((section) => section.deletedAt !== null);
}

export function trashedItems(depot: Depot): DepotItem[] {
  return depot.items.filter((item) => item.deletedAt !== null);
}

/** Items in use whose name or notes contain `query` (case and accents ignored). */
export function searchItems(depot: Depot, query: string): DepotItem[] {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return [];
  const sectionIds = new Set(activeSections(depot).map((section) => section.id));
  return sortItems(
    depot.items.filter(
      (item) =>
        item.deletedAt === null &&
        sectionIds.has(item.sectionId) &&
        normalizeForSearch(`${item.name}\n${item.notes}`).includes(needle),
    ),
  );
}

/** Owner of the area an item sits in; undefined when its section is unknown. */
export function itemOwner(
  depot: Depot,
  item: Pick<DepotItem, 'sectionId'>,
): string | null | undefined {
  return depot.sections.find((section) => section.id === item.sectionId)?.ownerId;
}

export const SHOP_SECTION_NAME = 'Compras do Entreposto';

export interface DepotDelivery {
  itemId: string;
  ownerId: string | null;
  authorId: string;
  name: string;
  kind: ItemKind;
  quantity: number;
  notes: string;
}

export function shopSectionId(ownerId: string | null): string {
  return `entreposto-${ownerId ?? 'grupo'}`.slice(0, 64);
}

/** Puts a purchase in the owner's "Compras do Entreposto" section, opening or restoring it when needed. */
export function deliverToDepot(depot: Depot, delivery: DepotDelivery, now: string): Depot {
  const { depot: withSection, section } = shopSectionFor(depot, delivery);
  const item: DepotItem = {
    id: delivery.itemId,
    sectionId: section.id,
    name: delivery.name,
    kind: delivery.kind,
    quantity: delivery.quantity,
    notes: delivery.notes,
    order: nextOrder(withSection.items.filter((i) => i.sectionId === section.id)),
    authorId: delivery.authorId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  return { ...withSection, items: [...withSection.items, item] };
}

function shopSectionFor(
  depot: Depot,
  { ownerId, authorId }: DepotDelivery,
): { depot: Depot; section: DepotSection } {
  const id = shopSectionId(ownerId);
  const area = activeSections(depot, ownerId);
  const live = area.find((s) => s.id === id) ?? area.find((s) => s.name === SHOP_SECTION_NAME);
  if (live) return { depot, section: live };
  const trashed = depot.sections.find((s) => s.id === id);
  if (trashed) {
    const restored = { ...trashed, deletedAt: null };
    return { depot: replaceSection(depot, restored), section: restored };
  }
  const created: DepotSection = {
    id,
    name: SHOP_SECTION_NAME,
    ownerId,
    order: nextOrder(area),
    authorId,
    deletedAt: null,
  };
  return { depot: { ...depot, sections: [...depot.sections, created] }, section: created };
}

/** What a write must send to storage: changed or new records, and records gone for good. */
export interface DepotDiff {
  sections: DepotSection[];
  items: DepotItem[];
  removedSectionIds: string[];
  removedItemIds: string[];
}

/** Rules return untouched records as the same objects, so identity tells what changed. */
export function depotDiff(before: Depot, after: Depot): DepotDiff {
  const changed = <T extends { id: string }>(old: readonly T[], next: readonly T[]) => {
    const previous = new Map(old.map((item) => [item.id, item]));
    return next.filter((item) => previous.get(item.id) !== item);
  };
  const removed = (old: readonly { id: string }[], next: readonly { id: string }[]) => {
    const kept = new Set(next.map((item) => item.id));
    return old.filter((item) => !kept.has(item.id)).map((item) => item.id);
  };
  return {
    sections: changed(before.sections, after.sections),
    items: changed(before.items, after.items),
    removedSectionIds: removed(before.sections, after.sections),
    removedItemIds: removed(before.items, after.items),
  };
}

// ---------------------------------------------------------------- rules

type CommandOf = { [C in DepotCommand as C['type']]: C };
interface World {
  depot: Depot;
  ctx: DepotContext;
  authorId: string;
}
type Handler<K extends DepotCommandType> = (command: CommandOf[K], world: World) => DepotOutcome;
type Handlers = { [K in DepotCommandType]: Handler<K> };

function run<K extends DepotCommandType>(
  type: K,
  command: CommandOf[K],
  world: World,
): DepotOutcome {
  const handler: Handlers[K] = handlers[type];
  return handler(command, world);
}

const fail = (error: DepotError): DepotOutcome => ({ ok: false, error });
const unchanged = (depot: Depot): DepotOutcome => ({ ok: true, depot, change: null });
const done = (depot: Depot, change: DepotChange | null): DepotOutcome => ({
  ok: true,
  depot,
  change,
});

const handlers: Handlers = {
  section_create: ({ id, ownerId, name, icon }, { depot, ctx, authorId }) => {
    // A player opens sections in the group's depot or in their own area only.
    if (!canSeeArea(ctx.viewer, ownerId)) return fail('forbidden');
    const error = idError(id, depot.sections) ?? sectionNameError(depot, ownerId, name);
    if (error) return fail(error);
    const section: DepotSection = {
      id,
      name: name.trim(),
      ...iconField(icon),
      ownerId,
      order: nextOrder(activeSections(depot, ownerId)),
      authorId,
      deletedAt: null,
    };
    const change = { target: 'section', action: 'created', title: section.name } as const;
    return done({ ...depot, sections: [...depot.sections, section] }, shared(section, change));
  },

  section_update: ({ sectionId, name, icon }, { depot, ctx }) => {
    const section = findSection(depot, ctx.viewer, sectionId);
    if (!section) return fail('not_found');
    const error = sectionNameError(depot, section.ownerId, name, sectionId);
    if (error) return fail(error);
    const { id, ownerId, order, authorId, deletedAt } = section;
    const next: DepotSection = {
      id,
      ownerId,
      order,
      authorId,
      deletedAt,
      name: name.trim(),
      ...iconField(icon),
    };
    if (next.name === section.name && next.icon === section.icon) return unchanged(depot);
    const change = { target: 'section', action: 'edited', title: next.name } as const;
    return done(replaceSection(depot, next), shared(next, change));
  },

  section_shift: ({ sectionId, direction }, { depot, ctx }) => {
    const section = findSection(depot, ctx.viewer, sectionId);
    if (!section) return fail('not_found');
    const siblings = activeSections(depot, section.ownerId);
    const reordered = shift(siblings, sectionId, direction);
    if (!reordered || reordered === siblings) return unchanged(depot);
    const changed = renumber(reordered);
    if (changed.length === 0) return unchanged(depot);
    const change = { target: 'section', action: 'reordered', title: section.name } as const;
    return done(changed.reduce(replaceSection, depot), shared(section, change));
  },

  section_remove: ({ sectionId }, { depot, ctx }) => {
    const section = findSection(depot, ctx.viewer, sectionId);
    if (!section) return fail('not_found');
    if (depot.items.some((i) => i.sectionId === sectionId && i.deletedAt === null)) {
      return fail('category_not_empty');
    }
    const next = replaceSection(depot, { ...section, deletedAt: ctx.now });
    const change = { target: 'section', action: 'removed', title: section.name } as const;
    return done(next, shared(section, change));
  },

  section_restore: ({ sectionId }, { depot, ctx }) => {
    const section = depot.sections.find(
      (s) => s.id === sectionId && s.deletedAt !== null && canSeeArea(ctx.viewer, s.ownerId),
    );
    if (!section) return fail('not_found');
    const error = sectionNameError(depot, section.ownerId, section.name, sectionId);
    if (error) return fail(error);
    const next = replaceSection(depot, { ...section, deletedAt: null });
    const change = { target: 'section', action: 'restored', title: section.name } as const;
    return done(next, shared(section, change));
  },

  item_create: ({ id, sectionId, ...fields }, { depot, ctx, authorId }) => {
    const section = findSection(depot, ctx.viewer, sectionId);
    if (!section) return fail('not_found');
    const error = idError(id, depot.items) ?? itemFieldsError(fields);
    if (error) return fail(error);
    const item: DepotItem = {
      id,
      sectionId,
      ...cleanFields(fields),
      order: nextOrder(depot.items.filter((i) => i.sectionId === sectionId)),
      authorId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
    };
    const change = itemChange(item, 'created', section);
    return done({ ...depot, items: [...depot.items, item] }, change);
  },

  item_update: ({ itemId, ...fields }, { depot, ctx, authorId }) => {
    const found = findItem(depot, ctx.viewer, itemId);
    if (!found) return fail('not_found');
    const error = itemFieldsError(fields);
    if (error) return fail(error);
    const clean = cleanFields(fields);
    const { item, section } = found;
    if (sameFields(item, clean)) return unchanged(depot);
    const next = { ...item, ...clean, editedBy: authorId, updatedAt: ctx.now };
    return done(replaceItem(depot, next), itemChange(next, 'edited', section));
  },

  item_adjust: ({ itemId, delta }, { depot, ctx, authorId }) => {
    const found = findItem(depot, ctx.viewer, itemId);
    if (!found) return fail('not_found');
    if (delta === 0) return unchanged(depot);
    const quantity = found.item.quantity + delta;
    if (quantity < 1 || quantity > QUANTITY_LIMIT) return fail('invalid_quantity');
    const next = { ...found.item, quantity, editedBy: authorId, updatedAt: ctx.now };
    return done(replaceItem(depot, next), itemChange(next, 'edited', found.section));
  },

  item_move: ({ itemId, sectionId }, { depot, ctx }) => {
    const found = findItem(depot, ctx.viewer, itemId);
    const to = findSection(depot, ctx.viewer, sectionId);
    if (!found || !to) return fail('not_found');
    const { item, section: from } = found;
    if (item.sectionId === sectionId) return unchanged(depot);
    const order = nextOrder(depot.items.filter((i) => i.sectionId === sectionId));
    const next = { ...item, sectionId, order, updatedAt: ctx.now };
    return done(replaceItem(depot, next), moveChange(next, from, to));
  },

  item_shift: ({ itemId, direction }, { depot, ctx }) => {
    const found = findItem(depot, ctx.viewer, itemId);
    if (!found) return fail('not_found');
    const siblings = sectionItems(depot, found.item.sectionId);
    const reordered = shift(siblings, itemId, direction);
    if (!reordered || reordered === siblings) return unchanged(depot);
    const changed = renumber(reordered);
    if (changed.length === 0) return unchanged(depot);
    const change = itemChange(found.item, 'reordered', found.section);
    return done(changed.reduce(replaceItem, depot), change);
  },

  item_remove: ({ itemId }, { depot, ctx }) => {
    const found = findItem(depot, ctx.viewer, itemId);
    if (!found) return fail('not_found');
    const next = replaceItem(depot, { ...found.item, deletedAt: ctx.now });
    return done(next, itemChange(found.item, 'removed', found.section));
  },

  item_restore: ({ itemId }, { depot, ctx }) => {
    const item = depot.items.find((i) => i.id === itemId && i.deletedAt !== null);
    const section = item && depot.sections.find((s) => s.id === item.sectionId);
    if (!item || !section || !canSeeArea(ctx.viewer, section.ownerId)) return fail('not_found');
    // An item never sits in a section that is in the trash: the section comes back with it.
    const withSection =
      section.deletedAt === null ? depot : replaceSection(depot, { ...section, deletedAt: null });
    const next = replaceItem(withSection, { ...item, deletedAt: null });
    return done(next, itemChange(item, 'restored', section));
  },

  trash_empty: (_command, { depot, ctx }) => {
    if (ctx.viewer.role !== 'master') return fail('forbidden');
    const sections = depot.sections.filter((section) => section.deletedAt === null);
    const kept = new Set(sections.map((section) => section.id));
    const items = depot.items.filter((i) => i.deletedAt === null && kept.has(i.sectionId));
    if (sections.length === depot.sections.length && items.length === depot.items.length) {
      return unchanged(depot);
    }
    return done({ sections, items }, { target: 'trash', action: 'emptied' });
  },
};

function idError(id: string, taken: readonly { id: string }[]): DepotError | null {
  return taken.some((other) => other.id === id) ? 'duplicate_id' : null;
}

/** Not blank, not repeated within the same area (ignoring case and spaces). */
function sectionNameError(
  depot: Depot,
  ownerId: string | null,
  name: string,
  ownId?: string,
): DepotError | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty_name';
  if (trimmed.length > NAME_LIMIT) return 'too_long';
  const lower = trimmed.toLocaleLowerCase('pt-BR');
  const clash = activeSections(depot, ownerId).some(
    (section) => section.id !== ownId && section.name.toLocaleLowerCase('pt-BR') === lower,
  );
  return clash ? 'duplicate_name' : null;
}

function itemFieldsError({ name, quantity, notes }: ItemFields): DepotError | null {
  if (!name.trim()) return 'empty_name';
  if (name.trim().length > NAME_LIMIT || notes.length > ITEM_NOTES_LIMIT) return 'too_long';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > QUANTITY_LIMIT) {
    return 'invalid_quantity';
  }
  return null;
}

/** Players get `not_found` for another character's area, exactly as for a missing section. */
function findSection(depot: Depot, viewer: Actor, id: string): DepotSection | undefined {
  return depot.sections.find(
    (s) => s.id === id && s.deletedAt === null && canSeeArea(viewer, s.ownerId),
  );
}

function findItem(
  depot: Depot,
  viewer: Actor,
  id: string,
): { item: DepotItem; section: DepotSection } | undefined {
  const item = depot.items.find((i) => i.id === id && i.deletedAt === null);
  const section = item && findSection(depot, viewer, item.sectionId);
  return item && section ? { item, section } : undefined;
}

function cleanFields({ name, kind, quantity, notes }: ItemFields): ItemFields {
  return { name: name.trim(), kind, quantity, notes: notes.trim() };
}

function sameFields(item: DepotItem, fields: ItemFields): boolean {
  return (Object.keys(fields) as (keyof ItemFields)[]).every((key) => item[key] === fields[key]);
}

/** Private areas never reach the log: it is shared with every player. */
function shared(section: DepotSection, change: DepotChange): DepotChange | null {
  return section.ownerId === null ? change : null;
}

function itemChange(
  item: DepotItem,
  action: 'created' | 'edited' | 'reordered' | 'removed' | 'restored',
  section: DepotSection,
): DepotChange | null {
  return shared(section, {
    target: 'item',
    action,
    title: item.name,
    quantity: item.quantity,
  });
}

/**
 * Moves inside the group's depot are logged as moves; a move into or out of a
 * private area is logged as stored or taken, without naming the private section.
 */
function moveChange(item: DepotItem, from: DepotSection, to: DepotSection): DepotChange | null {
  const base = { target: 'item', title: item.name, quantity: item.quantity } as const;
  if (from.ownerId === null && to.ownerId === null) {
    return { ...base, action: 'moved', from: from.name, to: to.name };
  }
  if (to.ownerId === null) return { ...base, action: 'stored', to: to.name };
  if (from.ownerId === null) return { ...base, action: 'taken', from: from.name };
  return null;
}

function iconField(icon: string | undefined): { icon?: string } {
  const trimmed = icon?.trim();
  return trimmed ? { icon: trimmed } : {};
}

function nextOrder(items: readonly { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order + 1), 0);
}

/**
 * The list with `id` swapped with its neighbor: the same list when it is
 * already at that end, null when `id` is not in it.
 */
function shift<T extends { id: string }>(
  items: readonly T[],
  id: string,
  direction: 'up' | 'down',
): readonly T[] | null {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const target = direction === 'up' ? index - 1 : index + 1;
  const neighbor = items[target];
  const item = items[index];
  if (!neighbor || !item) return items;
  const next = [...items];
  next[index] = neighbor;
  next[target] = item;
  return next;
}

/** Gives each item its position as order, returning only the ones whose order changed. */
function renumber<T extends { order: number }>(items: readonly T[]): T[] {
  return items.flatMap((item, order) => (item.order === order ? [] : [{ ...item, order }]));
}

function replaceSection(depot: Depot, section: DepotSection): Depot {
  return { ...depot, sections: depot.sections.map((s) => (s.id === section.id ? section : s)) };
}

function replaceItem(depot: Depot, item: DepotItem): Depot {
  return { ...depot, items: depot.items.map((i) => (i.id === item.id ? item : i)) };
}
