import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { chunkSizeWarningLimit: 800 }, // three.js sozinho passa de 500 kB
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
