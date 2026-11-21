// @vitest-environment node
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const frontendDir = resolve(import.meta.dirname, '..');
const frontendRequire = createRequire(resolve(frontendDir, 'package.json'));

describe('Vite Dev Server & Single-Version Plugin Parity', () => {
  it('transforms /src/main.tsx and /src/App.tsx cleanly using the frontend-resolved Vite binary without Rolldown/Rollup version mismatch', async () => {
    const resolvedVitePkg = frontendRequire.resolve('vite/package.json');
    const viteEntryUrl = pathToFileURL(resolve(resolvedVitePkg, '../dist/node/index.js')).href;
    const { createServer } = (await import(viteEntryUrl)) as typeof import('vite');

    const server = await createServer({
      root: frontendDir,
      configFile: resolve(frontendDir, 'vite.config.ts'),
      logLevel: 'silent',
      server: { port: 0 },
    });

    try {
      const mainResult = await server.transformRequest('/src/main.tsx');
      expect(mainResult?.code).toBeTruthy();

      const appResult = await server.transformRequest('/src/App.tsx');
      expect(appResult?.code).toBeTruthy();
    } finally {
      await server.close();
    }
  });
});
