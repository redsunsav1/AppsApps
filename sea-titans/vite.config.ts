import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5180, open: false },
  build: {
    // один JS и один CSS — из них tools/build-single.mjs собирает самодостаточный HTML
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
