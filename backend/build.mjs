import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const backendDir = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(backendDir, 'dist');
const frontendHtmlPath = resolve(backendDir, '../frontend/dist/index.html');

if (!existsSync(frontendHtmlPath)) {
  throw new Error(
    `Missing single-file frontend bundle at ${frontendHtmlPath}. Run "npm run build" from the repository root first.`,
  );
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

await build({
  entryPoints: [resolve(backendDir, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  globalName: '_gasBundle',
  target: 'es2020',
  outfile: resolve(distDir, 'Code.js'),
  footer: {
    js: [
      '',
      'function doGet() {',
      '  return _gasBundle.doGet();',
      '}',
      '',
      'function getDashboardStatus() {',
      '  return _gasBundle.getDashboardStatus();',
      '}',
    ].join('\n'),
  },
});

copyFileSync(resolve(backendDir, 'appsscript.json'), resolve(distDir, 'appsscript.json'));
copyFileSync(frontendHtmlPath, resolve(distDir, 'index.html'));
