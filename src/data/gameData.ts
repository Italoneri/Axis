import buildingArtFiles from 'virtual:building-art';
import { withBuildingArt } from '../map/buildingArt';
import { parseCatalog } from '../model/catalog';
import assets from './assets.json';
import buildings from './buildings.json';
import currencies from './currencies.json';
import influence from './influence.json';
import layout from './layout.json';
import materials from './materials.json';
import npcs from './npcs.json';
import research from './research.json';
import skills from './skills.json';
import wallets from './wallets.json';

export const rawGameData = {
  currencies,
  buildings,
  layout,
  assets: withBuildingArt(assets, buildingArtFiles),
  wallets,
  materials,
  research,
  influence,
  skills,
  npcs,
};

export const gameData = parseCatalog(rawGameData);
