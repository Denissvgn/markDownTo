import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    maxWorkers: 1,
    fileParallelism: false,
    allowOnly: false,
    passWithNoTests: false,
    clearMocks: true,
    expect: { requireAssertions: true },
    globals: true,
    setupFiles: './vitest.setup.ts',
    css: true,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**']
  }
});
