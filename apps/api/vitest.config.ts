import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Strip real AI provider keys before any test runs (test/no-real-models.ts).
    setupFiles: ['./test/no-real-models.ts'],
  },
});
