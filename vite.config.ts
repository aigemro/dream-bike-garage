import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/peloton-merge/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
