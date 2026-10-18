import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { port: 5180, open: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
