import { parseCatalog } from '../model/catalog';
import assets from './assets.json';
import buildings from './buildings.json';
import resources from './resources.json';
import slots from './slots.json';

export const gameData = parseCatalog({ resources, buildings, slots, assets });
