// Types of the generated game.js bundle (src/server/rules.ts), for Deno.
// src/server/functionTypes.test.ts fails if they drift from the source.

export interface GameFunctionDeps {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  userFromToken(token: string): Promise<string | null>;
  /** Path in the game-images bucket → short-lived URL; paths that cannot be signed are left out. */
  signPhotos(paths: readonly string[]): Promise<Record<string, string>>;
}

export declare function serveGame(request: Request, deps: GameFunctionDeps): Promise<Response>;

export declare function paritySample(): string;
