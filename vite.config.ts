import { defineConfig } from 'vite';

export default defineConfig({
  base: '/peloton-merge/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
