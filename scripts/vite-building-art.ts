import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import type { Plugin } from 'vite';

const MODULE_ID = 'virtual:building-art';
const RESOLVED_ID = `\0${MODULE_ID}`;
const ART_FILE = /^[\w-]+\.(outer|middle|core)(\.lv\d+)?\.png$/;

/**
 * Exposes `virtual:building-art`: the names of the final building art files in
 * `dir`, so new art shows up in game without being listed in assets.json.
 * The dev server reloads the page when a file is added, replaced or removed.
 */
export function buildingArt(dir: string): Plugin {
  const listFiles = () =>
    readdirSync(dir)
      .filter((file) => ART_FILE.test(file))
      .sort();

  return {
    name: 'axis-building-art',
    resolveId: (id) => (id === MODULE_ID ? RESOLVED_ID : undefined),
    load: (id) =>
      id === RESOLVED_ID ? `export default ${JSON.stringify(listFiles())};` : undefined,
    configureServer(server) {
      const refresh = (file: string) => {
        if (!ART_FILE.test(basename(file))) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(dir);
      server.watcher.on('add', refresh).on('change', refresh).on('unlink', refresh);
    },
  };
}
