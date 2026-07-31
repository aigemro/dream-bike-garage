import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/dream-bike-garage/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
