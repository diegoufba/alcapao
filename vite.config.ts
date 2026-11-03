import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  // No GitHub Pages o site fica em /alcapao/ (`vite build --mode pages`); no resto, na raiz.
  base: mode === 'pages' ? '/alcapao/' : '/',
  build: { chunkSizeWarningLimit: 800 }, // three.js sozinho passa de 500 kB
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
