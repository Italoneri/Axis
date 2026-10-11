import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { t } from '../i18n/pt-BR';
import type { GameStore } from '../store';
import { el } from '../ui/dom';
import { button, confirmButton } from '../ui/widgets';
import type { GameBackend } from './SupabaseRepository';

const PAGE_SIZE = 50;

const inviteRowsSchema = z.array(
  z.object({
    id: z.string(),
    character_id: z.string(),
    expires_at: z.string(),
    used_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
  }),
);
type InviteRow = z.infer<typeof inviteRowsSchema>[number];

const createdSchema = z.object({ token: z.string() });

type Notify = (message: string, tone?: 'error') => void;

/**
 * Master card (online only): one invite link per character and the pending
 * invites, which can be revoked. Keeps one element across drawer re-renders so
 * the list is not fetched again on every game change.
 */
export class InvitesPanel {
  readonly element = el('section', { class: 'card card--master' });
  private invites: InviteRow[] = [];
  private newLink: { characterId: string; url: string } | null = null;
  private loadError = false;

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
    const { data, error } = await this.deps.client
      .from('invites')
      .select('id, character_id, expires_at, used_at, revoked_at')
      .eq('game_id', this.deps.gameId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    this.loadError = Boolean(error);
    if (error) console.error('[invites] load', error.message);
    else this.invites = inviteRowsSchema.parse(data);
    this.render();
  }

  private async create(characterId: string): Promise<void> {
    const reply = await this.deps.backend.callFunction({
      action: 'create_invite',
      gameId: this.deps.gameId,
      characterId,
    });
    const created = createdSchema.safeParse(reply.body);
    if (reply.status !== 201 || !created.success) {
      console.error('[invites] create', reply);
      return this.deps.notify(t.invites.failed, 'error');
    }
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ invite: created.data.token }).toString();
    url.hash = '';
    this.newLink = { characterId, url: url.toString() };
    await this.refresh();
  }

  private async revoke(inviteId: string): Promise<void> {
    const reply = await this.deps.backend.callFunction({
      action: 'revoke_invite',
      gameId: this.deps.gameId,
      inviteId,
    });
    if (reply.status === 200) this.deps.notify(t.invites.revoked);
    else this.deps.notify(t.invites.failed, 'error');
    await this.refresh();
  }

  private async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.deps.notify(t.invites.copied);
    } catch (error) {
      console.warn('[invites] clipboard', error);
      this.deps.notify(t.invites.copyFailed, 'error');
    }
  }

  private render(): void {
    const { characters } = this.deps.store.current;
    const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id;
    const now = Date.now();
    const pending = this.invites.filter(
      (i) => !i.used_at && !i.revoked_at && Date.parse(i.expires_at) > now,
    );
    this.element.replaceChildren(
      ...[
        el('h3', { class: 'section-title' }, t.invites.title),
        el('p', { class: 'panel__hint' }, t.invites.hint),
        el(
          'ul',
          { class: 'item-list' },
          ...characters.map((c) =>
            el(
              'li',
              { class: 'row row--wrap' },
              el('span', { class: 'item-row__name' }, c.name),
              button(t.invites.create, () => void this.create(c.id)),
            ),
          ),
        ),
        this.newLink && this.linkBox(nameOf(this.newLink.characterId), this.newLink.url),
        el('h4', { class: 'section-title' }, t.invites.pending),
        this.pendingList(pending, nameOf),
      ].filter((child): child is HTMLElement => child !== null),
    );
  }

  private pendingList(pending: InviteRow[], nameOf: (id: string) => string): HTMLElement {
    if (this.loadError) return el('p', { class: 'reasons' }, t.invites.loadFailed);
    if (pending.length === 0) return el('p', { class: 'panel__hint' }, t.invites.noPending);
    return el(
      'ul',
      { class: 'item-list' },
      ...pending.map((invite) =>
        el(
          'li',
          { class: 'row row--wrap' },
          el('span', { class: 'item-row__name' }, nameOf(invite.character_id)),
          el(
            'span',
            { class: 'panel__hint' },
            t.invites.expires(new Date(invite.expires_at).toLocaleDateString('pt-BR')),
          ),
          confirmButton(t.invites.revoke, () => void this.revoke(invite.id)),
        ),
      ),
    );
  }

  private linkBox(name: string, url: string): HTMLElement {
    const input = el('input', { class: 'input input--wide', value: url, readonly: true });
    input.addEventListener('focus', () => input.select());
    return el(
      'div',
      { class: 'subform' },
      el('p', {}, t.invites.newLink(name)),
      input,
      button(t.invites.copy, () => void this.copy(url), { primary: true }),
    );
  }
}
