import type Phaser from 'phaser';
import type { MapTextures, TextureImage } from './mapGenerator';

/** Asset keys of the map textures in assets.json. */
export const MAP_TEXTURE_KEYS = {
  floor: 'texture.floor',
  wall: 'texture.wall',
  marble: 'texture.marble',
} as const;

export function textureImage(textures: Phaser.Textures.TextureManager, key: string): TextureImage {
  const source = textures.get(key).getSourceImage();
  if (
    source instanceof HTMLImageElement ||
    source instanceof HTMLCanvasElement ||
    source instanceof ImageBitmap
  ) {
    return source;
  }
  throw new Error(`texture "${key}" is not a bitmap image`);
}

export function mapTextures(textures: Phaser.Textures.TextureManager): MapTextures {
  return {
    floor: textureImage(textures, MAP_TEXTURE_KEYS.floor),
    wall: textureImage(textures, MAP_TEXTURE_KEYS.wall),
    marble: textureImage(textures, MAP_TEXTURE_KEYS.marble),
  };
}

/** 2048 px by default; 1024 on phones and small screens, where memory and time are tighter. */
export function mapResolution(): number {
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 820;
  const touchOnly = window.matchMedia('(pointer: coarse)').matches;
  return smallScreen || touchOnly ? 1024 : 2048;
}
