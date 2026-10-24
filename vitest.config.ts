import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'apps/pwa/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
