import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const exposedKeys = [
  'REACT_APP_BACKEND_URL',
  'REACT_APP_API_URL',
  'REACT_APP_E2E_AUTH',
  'REACT_APP_TURNSTILE_SITE_KEY',
];

const legacyJsxPlugin = {
  name: 'sigcr-legacy-js-as-jsx',
  enforce: 'pre',
  async transform(code, id) {
    if (!/\/src\/.*\.js$/.test(id)) return null;
    return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
  },
};

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, rootDir, 'REACT_APP_');
  const browserEnv = Object.fromEntries(
    exposedKeys.map((key) => [key, process.env[key] ?? fileEnv[key]])
  );

  return {
    plugins: [legacyJsxPlugin, react({ include: /\.[jt]sx?$/ })],
    resolve: { alias: { '@': path.resolve(rootDir, 'src') } },
    define: {
      'process.env': JSON.stringify({
        ...browserEnv,
        NODE_ENV: mode === 'production' ? 'production' : 'development',
      }),
    },
    esbuild: { loader: 'jsx', include: /src\/.*\.jsx?$/ },
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
    build: { outDir: 'build', emptyOutDir: true },
  };
});
