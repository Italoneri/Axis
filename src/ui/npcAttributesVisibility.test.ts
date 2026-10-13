import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Força, Destreza and Poder Mágico are hidden from everyone but the master's
// NPC form: no card, list or mission picker may read them. The UI has no DOM
// test setup, so this guards the rule at the source.

const UI_DIR = join(import.meta.dirname);
const READS_ATTRIBUTES = /\.attributes\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** The body of a top-level function or a class method, up to the next one. */
function body(source: string, name: string): string {
  const start = source.search(new RegExp(`(function |private |  )${name}\\(`));
  if (start < 0) throw new Error(`${name} not found`);
  const next = source.slice(start + 1).search(/\n(function |\s{2}private |\s{2}[a-zA-Z]+\()/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

describe('NPC attributes in the interface', () => {
  const panel = readFileSync(join(UI_DIR, 'resources/NpcPanel.ts'), 'utf8');

  it('are read only by the NPC panel', () => {
    const readers = sourceFiles(UI_DIR)
      .filter((file) => READS_ATTRIBUTES.test(readFileSync(file, 'utf8')))
      .map((file) => relative(UI_DIR, file).replaceAll('\\', '/'));
    expect(readers).toEqual(['resources/NpcPanel.ts']);
  });

  it('show up in the create/edit form only', () => {
    expect(body(panel, 'attributeInputs')).toMatch(READS_ATTRIBUTES);
    ['card', 'list', 'skillBars', 'homeRow', 'jobRow'].forEach((name) => {
      const code = body(panel, name);
      // Guards the extraction itself: an empty slice would pass vacuously.
      expect(code.split('\n').length, name).toBeGreaterThan(5);
      expect(code, name).not.toMatch(/attribute/i);
    });
  });
});
