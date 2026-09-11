import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 },
  resolve: {
    alias: {
      '@tw/contracts': new URL('./packages/contracts/src/index.ts', import.meta.url).pathname,
      '@tw/analytics': new URL('./packages/analytics/src/index.ts', import.meta.url).pathname,
    },
  },
});
