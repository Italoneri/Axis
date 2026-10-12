import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { t } from '../i18n/pt-BR';
import type { GameStore } from '../store';
import { el } from '../ui/dom';
import { button, confirmButton, field, selectInput } from '../ui/widgets';
import { copyLink, linkBox } from './linkBox';
import type { GameBackend } from './SupabaseRepository';

const PAGE_SIZE = 20;
/** Validity choices for a new entry link, in days; '' never expires. */
const VALIDITY_DAYS = ['', '7', '30'] as const;

const linkRowsSchema = z.array(
  z.object({
    id: z.string(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  }),
);
type LinkRow = z.infer<typeof linkRowsSchema>[number];

const playerRowsSchema = z.array(
  z.object({
    user_id: z.string(),
    role: z.enum(['master', 'player']),
    character_id: z.string().nullable(),
    display_name: z.string().nullable(),
    email: z.string().nullable(),
  }),
);
type PlayerRow = z.infer<typeof playerRowsSchema>[number];

const createdSchema = z.object({ token: z.string() });

type Notify = (message: string, tone?: 'error') => void;

/**
 * Master card (online only): the game's entry link, the one sent to the group,
 * and who plays which character, with "Desligar" to undo a link. Keeps one
 * element across drawer re-renders, like the invites card.
 */
export class PlayersPanel {
  readonly element = el('section', { class: 'card card--master' });
  private links: LinkRow[] = [];
  private players: PlayerRow[] = [];
  private newLink: string | null = null;
  private loadError = false;
  private readonly validity = selectInput({
    label: t.players.validity,
    value: '',
    options: VALIDITY_DAYS.map((days) => ({ value: days, label: t.players.validityOption(days) })),
  });

  constructor(
    private readonly deps: {
      client: SupabaseClient;
      backend: GameBackend;
      gameId: string;
      store: GameStore;
      notify: Notify;
    },
  ) {
    deps.store.subscribe(() => this.render());
    this.render();
  }

  /** Called when the master tab opens. */
  async refresh(): Promise<void> {
    const [links, players] = await Promise.all([
      this.deps.client
        .from('join_links')
        .select('id, expires_at, revoked_at')
        .eq('game_id', this.deps.gameId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      this.deps.client.rpc('list_players', { target_game: this.deps.gameId }),
    ]);
    const error = links.error ?? players.error;
    this.loadError = Boolean(error);
    if (error) console.error('[players] load', error.message);
    else {
      this.links = linkRowsSchema.parse(links.data);
      this.players = playerRowsSchema.parse(players.data);
    }
    this.render();
  }

  private async createLink(): Promise<void> {
    const days = Number(this.validity.value);
    const reply = await this.deps.backend.callFunction({
      action: 'create_join_link',
      gameId: this.deps.gameId,
      ...(days > 0 ? { expiresInDays: days } : {}),
    });
    const created = createdSchema.safeParse(reply.body);
    if (reply.status !== 201 || !created.success) {
      console.error('[players] create link', reply);
      return this.deps.notify(t.players.failed, 'error');
    }
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ join: created.data.token }).toString();
    url.hash = '';
    this.newLink = url.toString();
    await this.refresh();
  }

  private async act(body: Record<string, unknown>, done: string): Promise<void> {
    const reply = await this.deps.backend.callFunction({ ...body, gameId: this.deps.gameId });
    if (reply.status === 200) this.deps.notify(done);
    else {
      console.error(`[players] ${String(body['action'])}`, reply);
      this.deps.notify(t.players.failed, 'error');
    }
    await this.refresh();
  }

  private render(): void {
    this.element.replaceChildren(
      el('h3', { class: 'section-title' }, t.players.linkTitle),
      el('p', { class: 'panel__hint' }, t.players.linkHint),
      el(
        'div',
        { class: 'row row--wrap' },
        field(t.players.validity, this.validity),
        button(t.players.createLink, () => void this.createLink(), { primary: true }),
      ),
      ...(this.newLink
        ? [linkBox(t.players.newLink, this.newLink, (url) => copyLink(url, this.deps.notify))]
        : []),
      this.linkList(),
      el('h3', { class: 'section-title' }, t.players.title),
      this.playerList(),
    );
  }

  private linkList(): HTMLElement {
    if (this.loadError) return el('p', { class: 'reasons' }, t.players.loadFailed);
    const now = Date.now();
    const active = this.links.filter((l) => !l.expires_at || Date.parse(l.expires_at) > now);
    if (active.length === 0) return el('p', { class: 'panel__hint' }, t.players.noLinks);
    return el(
      'ul',
      { class: 'item-list' },
      ...active.map((link) =>
        el(
          'li',
          { class: 'row row--wrap' },
          el(
            'span',
            { class: 'item-row__name' },
            link.expires_at
              ? t.players.linkExpires(new Date(link.expires_at).toLocaleDateString('pt-BR'))
              : t.players.linkForever,
          ),
          confirmButton(
            t.players.revoke,
            () => void this.act({ action: 'revoke_join_link', linkId: link.id }, t.players.revoked),
          ),
        ),
      ),
    );
  }

  private playerList(): HTMLElement {
    if (this.loadError) return el('p', { class: 'reasons' }, t.players.loadFailed);
    if (this.players.length === 0) return el('p', { class: 'panel__hint' }, t.players.empty);
    const { characters } = this.deps.store.current;
    const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id;
    return el(
      'ul',
      { class: 'item-list' },
      ...this.players.map((player) =>
        el(
          'li',
          { class: 'row row--wrap' },
          el(
            'span',
            { class: 'item-row__name' },
            player.display_name ?? player.email ?? t.players.unnamed,
          ),
          el(
            'span',
            { class: 'panel__hint' },
            player.character_id ? `→ ${nameOf(player.character_id)}` : t.players.master,
          ),
          ...(player.role === 'player'
            ? [
                confirmButton(
                  t.players.unlink,
                  () =>
                    void this.act(
                      { action: 'unlink_player', userId: player.user_id },
                      t.players.unlinked,
                    ),
                ),
              ]
            : []),
        ),
      ),
    );
  }
}
