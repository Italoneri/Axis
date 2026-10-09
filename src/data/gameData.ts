import { parseCatalog } from '../model/catalog';
import assets from './assets.json';
import buildings from './buildings.json';
import currencies from './currencies.json';
import influence from './influence.json';
import layout from './layout.json';
import materials from './materials.json';
import research from './research.json';
import wallets from './wallets.json';

export const rawGameData = {
  currencies,
  buildings,
  layout,
  assets,
  wallets,
  materials,
  research,
  influence,
};

export const gameData = parseCatalog(rawGameData);
