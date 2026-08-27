import fs from 'node:fs';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import { buildInfoPlugin } from './build/buildInfo';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseHost(v: string | undefined): string | true | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'true' || trimmed === '1') return true;
  return trimmed;
}

function readFileMaybe(path: string | undefined): Buffer | undefined {
  if (!path) return undefined;
  try {
    return fs.readFileSync(path);
  } catch {
    return undefined;
  }
}

function normalizeBasename(value: string | undefined): string {
  if (!value) return '';
  let v = value.trim();
  if (!v || v === '/') return '';
  if (!v.startsWith('/')) v = `/${v}`;
  v = v.replace(/\/+$/, '');
  return v === '/' ? '' : v;
}

function manualVendorChunk(id: string): string | undefined {
  if (id.includes('/src/i18n/locales/en/') || id.includes('/src/i18n/en.ts')) return 'locale-en';
  if (id.includes('/src/i18n/locales/cs/') || id.includes('/src/i18n/cs.ts')) return 'locale-cs';

  if (
    id.includes('/src/components/layout/ActionStatesPanel.tsx') ||
    id.includes('/src/components/layout/TransactionChainsPanel.tsx') ||
    id.includes('/src/components/layout/CommandPalette.tsx') ||
    id.includes('/src/components/layout/BlockingActionProgressModal.tsx')
  ) {
    return 'app-chrome-overlays';
  }

  if (!id.includes('/node_modules/')) return undefined;
  if (id.includes('/react-router')) return 'vendor-router';
  if (id.includes('/@tanstack/react-query/')) return 'vendor-query';
  if (id.includes('/lucide-react/')) return 'vendor-icons';
  if (id.includes('/react-dom/') || id.includes('/react/')) return 'vendor-react';
  return undefined;
}

/**
 * Dev + build config.
 *
 * Notes:
 * - For sub-path deployments (e.g. https://vpsadmin.dev/ui-next/), set VITE_ROUTER_BASENAME=/ui-next
 *   at build time so assets are emitted under that prefix.
 * - API proxy is optional and intended only for local DX (CORS avoidance). For a production-like
 *   dev deployment, do NOT set VITE_API_PROXY_TARGET.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Build-time public base path for assets (must match the server mount path).
  const routerBasename = normalizeBasename(
    env.VITE_ROUTER_BASENAME ?? env.VITE_BASE_PATH ?? env.VITE_PUBLIC_BASE_PATH
  );
  const base = routerBasename ? `${routerBasename}/` : '/';

  // Optional API proxy (disabled by default).
  const proxyTarget = env.VITE_API_PROXY_TARGET;
  const proxyPrefix = env.VITE_API_PROXY_PREFIX?.trim() || '/api';
  const proxySecure = (env.VITE_API_PROXY_SECURE ?? 'true') !== 'false';

  const host = parseHost(env.VITE_DEV_HOST);
  const port = Number(env.VITE_DEV_PORT) || 5173;

  const httpsEnabled = (env.VITE_DEV_HTTPS ?? 'false') === 'true';
  const httpsKey = readFileMaybe(env.VITE_DEV_HTTPS_KEY);
  const httpsCert = readFileMaybe(env.VITE_DEV_HTTPS_CERT);
  const https = httpsEnabled && httpsKey && httpsCert ? { key: httpsKey, cert: httpsCert } : undefined;

  const prefixRe = new RegExp(`^${escapeRegExp(proxyPrefix)}`);

  return {
    plugins: [react(), buildInfoPlugin({ cwd: process.cwd(), env })],
    base,
    server: {
      port,
      strictPort: true,
      host,
      https,
      proxy: proxyTarget
        ? {
            [proxyPrefix]: {
              target: proxyTarget,
              changeOrigin: true,
              secure: proxySecure,
              rewrite: (path) => path.replace(prefixRe, ''),
            },
          }
        : undefined,
    },
    build: {
      modulePreload: {
        resolveDependencies: (_url, deps) =>
          deps.filter((dep) => !dep.includes('locale-cs') && !dep.includes('app-chrome-overlays')),
      },
      rollupOptions: {
        output: {
          manualChunks: manualVendorChunk,
          onlyExplicitManualChunks: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      globals: true,
      exclude: ['**/node_modules/**', 'dist/**', 'e2e/**', 'scripts/**', 'bff/**'],
    },
  };
});
