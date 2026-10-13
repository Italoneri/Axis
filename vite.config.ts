import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { buildingArt } from './scripts/vite-building-art';

// `base: './'` keeps asset paths relative so the build works on GitHub Pages subpaths.
export default defineConfig({
  base: './',
  plugins: [buildingArt(fileURLToPath(new URL('./public/assets/buildings', import.meta.url)))],
  // Phaser alone is ~1.2 MB minified; splitting it would not reduce what the page needs to load.
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
