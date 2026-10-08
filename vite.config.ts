import { defineConfig } from 'vitest/config';

// `base: './'` keeps asset paths relative so the build works on GitHub Pages subpaths.
export default defineConfig({
  base: './',
  // Phaser alone is ~1.2 MB minified; splitting it would not reduce what the page needs to load.
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
