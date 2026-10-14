/**
 * Local fixes to the generator's sheet definitions, applied by `npm run lpc:setup`
 * after each update (the reset brings the upstream copy back).
 *
 * arms_gloves: the PNGs are painted in the cloth palette (base "white"), but the
 * definition declares the metal one (base "steel"), so most of their pixels never
 * match the source palette and any color comes out cream. Declared as cloth, the
 * colors apply; the metal ones stay available as `metal.<color>`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATOR_DIR } from './paths';

interface Recolors {
  material: string;
  palettes: string[];
}

export interface DefinitionFix {
  /** Path inside sheet_definitions/. */
  readonly file: string;
  /** The upstream value the fix expects; anything else means upstream changed. */
  readonly from: Recolors;
  readonly to: Recolors;
}

export const GLOVES_FIX: DefinitionFix = {
  file: 'arms/arms_gloves.json',
  from: { material: 'metal', palettes: ['ulpc', 'cloth.ulpc', 'lpcr', 'all.lpcr'] },
  to: { material: 'cloth', palettes: ['ulpc', 'metal.ulpc', 'all.lpcr'] },
};

export const DEFINITION_FIXES: readonly DefinitionFix[] = [GLOVES_FIX];

export type FixOutcome = 'applied' | 'already' | 'upstream-changed';

/** The definition with the fix, or why it was left as is. */
export function fixDefinition(
  definition: Record<string, unknown>,
  fix: DefinitionFix,
): { outcome: FixOutcome; definition: Record<string, unknown> } {
  const current = JSON.stringify(definition.recolors);
  if (current === JSON.stringify(fix.to)) return { outcome: 'already', definition };
  if (current !== JSON.stringify(fix.from)) return { outcome: 'upstream-changed', definition };
  return { outcome: 'applied', definition: { ...definition, recolors: fix.to } };
}

export function applyDefinitionFixes(): void {
  for (const fix of DEFINITION_FIXES) {
    const path = join(GENERATOR_DIR, 'sheet_definitions', fix.file);
    if (!existsSync(path)) {
      console.warn(`[lpc] ${fix.file} is gone upstream; its local fix was skipped`);
      continue;
    }
    const { outcome, definition } = fixDefinition(
      JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>,
      fix,
    );
    if (outcome === 'applied') writeFileSync(path, `${JSON.stringify(definition, null, 2)}\n`);
    if (outcome === 'upstream-changed') {
      console.warn(
        `[lpc] ${fix.file} changed upstream; check whether its local fix is still needed`,
      );
    }
  }
}
