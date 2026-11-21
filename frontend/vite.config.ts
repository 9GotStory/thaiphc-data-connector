import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({
      useRecommendedBuildConfig: true,
      removeViteModuleLoader: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(rootDir, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
