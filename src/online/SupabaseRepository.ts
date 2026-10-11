import { z } from 'zod';
import { isCommandError } from '../commands/applyCommand';
import type { Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import type { GameChange, GameRepository, SubmitResult } from '../persistence/GameRepository';
import { parseState } from '../systems/SaveSystem';

/** The three things the online game needs from Supabase; `supabaseBackend` wires the real ones. */
export interface GameBackend {
  /** `games.state` as stored (RLS: members only). */
  fetchState(gameId: string): Promise<unknown>;
  /** POST to the `game` Edge Function with the user's session. */
  callFunction(body: Record<string, unknown>): Promise<FunctionReply>;
  /** Realtime updates of `games.state`; returns the unsubscribe. */
  watchState(gameId: string, onState: (state: unknown) => void): () => void;
}

export interface FunctionReply {
  status: number;
  body: unknown;
}

const refusalSchema = z.object({ error: z.literal('refused'), reason: z.string() });
const stateReplySchema = z.object({ state: z.unknown() });

/**
 * Online repository: the Edge Function applies every change with the same
 * rules, deciding the actor from the login (the `ctx` sent along is ignored).
 */
export class SupabaseRepository implements GameRepository {
  constructor(
    private readonly backend: GameBackend,
    private readonly gameId: string,
    private readonly catalog: Catalog,
  ) {}

  async load(): Promise<GameState> {
    return this.parse(await this.backend.fetchState(this.gameId), 'load');
  }

  async submit(change: GameChange, expectedRevision: number): Promise<SubmitResult> {
    const { gameId } = this;
    const body =
      change.kind === 'command'
        ? { action: 'command', gameId, command: change.command, expectedRevision }
        : { action: 'restore_save', gameId, state: change.state, expectedRevision };
    const reply = await this.backend.callFunction(body);

    if (reply.status === 200) {
      return { ok: true, state: this.parse(stateReplySchema.parse(reply.body).state, 'submit') };
    }
    if (reply.status === 409) return { ok: false, reason: 'conflict' };
    const refusal = refusalSchema.safeParse(reply.body);
    if (refusal.success && isCommandError(refusal.data.reason)) {
      return { ok: false, reason: 'refused', error: refusal.data.reason };
    }
    // 401 (session expired), 403 not_member, 5xx: not a game rule, so the store reports it.
    throw new Error(`game function answered ${reply.status}: ${JSON.stringify(reply.body)}`);
  }

  subscribe(onRemoteChange: (state: GameState) => void): () => void {
    return this.backend.watchState(this.gameId, (json) => {
      const parsed = parseState(json, this.catalog);
      if (parsed.ok) onRemoteChange(parsed.state);
      else console.error('[online] ignoring invalid game from realtime', parsed.error);
    });
  }

  private parse(json: unknown, operation: string): GameState {
    const parsed = parseState(json, this.catalog);
    if (!parsed.ok) throw new Error(`${operation}: stored game is invalid: ${parsed.error}`);
    return parsed.state;
  }
}
