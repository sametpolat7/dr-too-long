import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['fake-indexeddb/auto', './test/setup-dom.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    coverage: { include: ['src/**'], reporter: ['text'] },
  },
});
