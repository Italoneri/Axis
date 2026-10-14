import { z } from 'zod';
import type { DepotRepository, DepotSubmitResult } from '../persistence/DepotRepository';
import {
  applyDepotCommand,
  depotDiff,
  EMPTY_DEPOT,
  itemOwner,
  parseDepot,
  type Depot,
  type DepotCommand,
  type DepotContext,
  type DepotDiff,
  type DepotItem,
  type DepotSection,
} from '../systems/Depot';

export type DepotTable = 'depot_sections' | 'depot_items';

/** Rows as Postgres stores them (snake_case, nulls). */
export interface DepotRows {
  sections: SectionRow[];
  items: ItemRow[];
}

export type DepotRowEvent =
  | { table: DepotTable; kind: 'upsert'; row: unknown }
  /** Deletes carry only the primary key. */
  | { table: DepotTable; kind: 'delete'; id: string };

/** Refusals the database answers with; anything else is thrown. */
export type DepotWriteResult =
  { ok: true } | { ok: false; error: 'forbidden' | 'category_not_empty' };

/** What the online depot needs from Supabase; `supabaseDepotBackend` wires the real one. */
export interface DepotBackend {
  /** Both tables of the game, as RLS lets this user see them. */
  fetchRows(gameId: string): Promise<{ sections: unknown[]; items: unknown[] }>;
  /** Upserts, then deletes, in an order the foreign key accepts. */
  writeRows(gameId: string, rows: DepotRowsChange): Promise<DepotWriteResult>;
  /** `replace_depot`, master only. */
  replaceRows(gameId: string, rows: DepotRows): Promise<DepotWriteResult>;
  watch(gameId: string, onEvent: (event: DepotRowEvent) => void): () => void;
}

export interface DepotRowsChange extends DepotRows {
  removedSectionIds: string[];
  removedItemIds: string[];
}

// ---------------------------------------------------------------- rows

const sectionRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  owner_id: z.string().nullable(),
  position: z.number().int(),
  author_id: z.string(),
  deleted_at: z.string().nullable(),
});

const itemRowSchema = z.object({
  id: z.string(),
  section_id: z.string(),
  /** Copy of the section's owner, for RLS; the model reads it from the section. */
  owner_id: z.string().nullable(),
  name: z.string(),
  kind: z.string(),
  quantity: z.number().int(),
  notes: z.string(),
  position: z.number().int(),
  author_id: z.string(),
  edited_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

type SectionRow = z.infer<typeof sectionRowSchema>;
type ItemRow = z.infer<typeof itemRowSchema>;

export function sectionToRow(section: DepotSection): SectionRow {
  return {
    id: section.id,
    name: section.name,
    icon: section.icon ?? null,
    owner_id: section.ownerId,
    position: section.order,
    author_id: section.authorId,
    deleted_at: section.deletedAt,
  };
}

/** `depot` is where the item's section is looked up, for the owner column. */
export function itemToRow(item: DepotItem, depot: Depot): ItemRow {
  return {
    id: item.id,
    section_id: item.sectionId,
    owner_id: itemOwner(depot, item) ?? null,
    name: item.name,
    kind: item.kind,
    quantity: item.quantity,
    notes: item.notes,
    position: item.order,
    author_id: item.authorId,
    edited_by: item.editedBy ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt,
  };
}

function sectionFromRow(row: SectionRow): unknown {
  return {
    id: row.id,
    name: row.name,
    ...(row.icon ? { icon: row.icon } : {}),
    ownerId: row.owner_id,
    order: row.position,
    authorId: row.author_id,
    deletedAt: row.deleted_at,
  };
}

function itemFromRow(row: ItemRow): unknown {
  return {
    id: row.id,
    sectionId: row.section_id,
    name: row.name,
    kind: row.kind,
    quantity: row.quantity,
    notes: row.notes,
    order: row.position,
    authorId: row.author_id,
    ...(row.edited_by ? { editedBy: row.edited_by } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Rows from the database (or realtime) into a checked depot. */
export function depotFromRows(raw: { sections: unknown[]; items: unknown[] }): Depot {
  const sections = z.array(sectionRowSchema).parse(raw.sections).map(sectionFromRow);
  const items = z.array(itemRowSchema).parse(raw.items).map(itemFromRow);
  const parsed = parseDepot({ sections, items });
  if (!parsed.ok) throw new Error(`depot rows are invalid: ${parsed.error}`);
  return parsed.depot;
}

function rowsChange(diff: DepotDiff, after: Depot): DepotRowsChange {
  return {
    sections: diff.sections.map(sectionToRow),
    items: diff.items.map((item) => itemToRow(item, after)),
    removedSectionIds: diff.removedSectionIds,
    removedItemIds: diff.removedItemIds,
  };
}

function isEmpty(change: DepotRowsChange): boolean {
  return [change.sections, change.items, change.removedSectionIds, change.removedItemIds].every(
    (list) => list.length === 0,
  );
}

// ---------------------------------------------------------------- repository

/**
 * Online depot: rules run here on the copy this user may see, and only the
 * rows that changed are written. RLS and the triggers have the last word: a
 * refusal from the database is reported like one from the rules.
 */
export class SupabaseDepotRepository implements DepotRepository {
  private cache: Depot | null = null;

  constructor(
    private readonly backend: DepotBackend,
    private readonly gameId: string,
  ) {}

  async load(): Promise<Depot> {
    this.cache = depotFromRows(await this.backend.fetchRows(this.gameId));
    return this.cache;
  }

  async submit(command: DepotCommand, ctx: DepotContext): Promise<DepotSubmitResult> {
    const base = this.cache ?? (await this.load());
    const outcome = applyDepotCommand(base, command, ctx);
    if (!outcome.ok) return outcome;
    const change = rowsChange(depotDiff(base, outcome.depot), outcome.depot);
    if (isEmpty(change)) return outcome;

    const written = await this.backend.writeRows(this.gameId, change);
    if (!written.ok) {
      // Something this copy did not know (a newer change): catch up.
      await this.load();
      return written;
    }
    this.cache = outcome.depot;
    return outcome;
  }

  async replace(depot: Depot): Promise<void> {
    const written = await this.backend.replaceRows(this.gameId, {
      sections: depot.sections.map(sectionToRow),
      items: depot.items.map((item) => itemToRow(item, depot)),
    });
    if (!written.ok) throw new Error(`replace depot: ${written.error}`);
    this.cache = null;
  }

  subscribe(onRemoteChange: (depot: Depot) => void): () => void {
    return this.backend.watch(this.gameId, (event) => {
      const next = applyDepotRowEvent(this.cache ?? EMPTY_DEPOT, event);
      if (!next) return;
      this.cache = next;
      onRemoteChange(next);
    });
  }
}

/** The depot with one realtime event applied; null when the event is unusable or unrelated. */
export function applyDepotRowEvent(depot: Depot, event: DepotRowEvent): Depot | null {
  const isSection = event.table === 'depot_sections';
  if (event.kind === 'delete') {
    const has = (isSection ? depot.sections : depot.items).some((item) => item.id === event.id);
    if (!has) return null;
    if (isSection) {
      return {
        sections: depot.sections.filter((s) => s.id !== event.id),
        items: depot.items.filter((i) => i.sectionId !== event.id),
      };
    }
    return { ...depot, items: depot.items.filter((i) => i.id !== event.id) };
  }
  try {
    const single = depotFromRows({
      sections: isSection ? [event.row] : [],
      items: isSection ? [] : [event.row],
    });
    return {
      sections: upsert(depot.sections, single.sections[0]),
      items: upsert(depot.items, single.items[0]),
    };
  } catch (error) {
    console.warn('[depot] ignoring unexpected realtime row', error);
    return null;
  }
}

function upsert<T extends { id: string }>(items: readonly T[], item: T | undefined): T[] {
  if (!item) return [...items];
  const exists = items.some((other) => other.id === item.id);
  return exists ? items.map((other) => (other.id === item.id ? item : other)) : [...items, item];
}
