import buildingArtFiles from 'virtual:building-art';
import { withBuildingArt } from '../map/buildingArt';
import { parseCatalog } from '../model/catalog';
import assets from './assets.json';
import attributes from './attributes.json';
import buildings from './buildings.json';
import currencies from './currencies.json';
import garden from './garden.json';
import influence from './influence.json';
import layout from './layout.json';
import materials from './materials.json';
import missions from './missions.json';
import npcs from './npcs.json';
import research from './research.json';
import shop from './shop.json';
import skills from './skills.json';
import tavernMenu from './tavern_menu.json';
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
  attributes,
  npcs,
  missions,
  shop,
  garden,
  tavernMenu,
};

export const gameData = parseCatalog(rawGameData);
