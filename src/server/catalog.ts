import assets from '../data/assets.json';
import attributes from '../data/attributes.json';
import buildings from '../data/buildings.json';
import currencies from '../data/currencies.json';
import influence from '../data/influence.json';
import layout from '../data/layout.json';
import materials from '../data/materials.json';
import missions from '../data/missions.json';
import npcs from '../data/npcs.json';
import research from '../data/research.json';
import shop from '../data/shop.json';
import skills from '../data/skills.json';
import wallets from '../data/wallets.json';
import { parseCatalog } from '../model/catalog';

/**
 * The same JSON files the game ships, minus the building art (a Vite-only
 * virtual module the rules never read). Bundled into the Edge Function, so the
 * server always validates with the data of the commit it was deployed from.
 */
export const serverCatalog = parseCatalog({
  currencies,
  buildings,
  layout,
  assets,
  wallets,
  materials,
  research,
  influence,
  skills,
  attributes,
  npcs,
  missions,
  shop,
});
