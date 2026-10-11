import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logEntryText, t, type TextContext } from '../i18n/pt-BR';
import { logEntrySchema } from '../model/schema';
import type { GameStore } from '../store';
import { el } from '../ui/dom';
import { textContext } from '../ui/format';
import { button } from '../ui/widgets';

const PAGE_SIZE = 50;

const historyRowsSchema = z.array(
  z.object({
    id: z.number().int(),
    command: z.unknown(),
    entries: z.array(logEntrySchema),
  }),
);
export type HistoryRow = z.infer<typeof historyRowsSchema>[number];

const restoreCommandSchema = z.object({ type: z.literal('restore_save') });

/** Lines to show for history rows, newest first; a restored backup has no entries of its own. */
export function historyLines(rows: readonly HistoryRow[], ctx: TextContext): string[] {
  return rows.flatMap((row) => {
    if (restoreCommandSchema.safeParse(row.command).success) return [t.history.restored];
    return [...row.entries].reverse().map((entry) => logEntryText(entry, ctx));
  });
}

/**
 * Card in the log tab (online only): the whole `game_log`, newest first, a page
 * at a time. The state keeps only the latest entries; this reads the rest.
 */
export class HistoryPanel {
  readonly element = el('section', { class: 'card' });
  private rows: HistoryRow[] = [];
  private hasMore = false;
  private loadError = false;

  constructor(private readonly deps: { client: SupabaseClient; gameId: string; store: GameStore }) {
    this.render();
  }

  /** Called when the log tab opens: starts again from the newest entry. */
  async refresh(): Promise<void> {
    this.rows = [];
    await this.loadPage();
  }

  private async loadPage(): Promise<void> {
    const oldest = this.rows.at(-1)?.id;
    let query = this.deps.client
      .from('game_log')
      .select('id, command, entries')
      .eq('game_id', this.deps.gameId)
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (oldest !== undefined) query = query.lt('id', oldest);
    const { data, error } = await query;
    const page = historyRowsSchema.safeParse(data);
    this.loadError = Boolean(error) || !page.success;
    if (error) console.error('[history] load', error.message);
    else if (!page.success) console.error('[history] unexpected rows', page.error.message);
    else {
      this.rows = [...this.rows, ...page.data];
      this.hasMore = page.data.length === PAGE_SIZE;
    }
    this.render();
  }

  private render(): void {
    const ctx = textContext(this.deps.store.catalog, this.deps.store.current);
    const lines = historyLines(this.rows, ctx);
    this.element.replaceChildren(
      el('h3', { class: 'section-title' }, t.history.title),
      el('p', { class: 'panel__hint' }, t.history.hint),
      this.body(lines),
    );
  }

  private body(lines: string[]): HTMLElement {
    if (this.loadError) return el('p', { class: 'reasons' }, t.history.loadFailed);
    if (lines.length === 0) return el('p', { class: 'panel__hint' }, t.history.empty);
    return el(
      'div',
      {},
      el('ol', { class: 'log' }, ...lines.map((line) => el('li', { class: 'log__entry' }, line))),
      this.hasMore && button(t.history.more, () => void this.loadPage()),
    );
  }
}
