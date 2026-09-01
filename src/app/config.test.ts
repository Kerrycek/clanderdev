import { afterEach, describe, expect, it } from 'vitest';

import { getRuntimeConfig } from './config';

const ENV_KEYS = [
  'VITE_API_URL',
  'VITE_API_VERSION',
  'VITE_WEBUI_URL',
  'VITE_LEGACY_WEBUI_URL',
  'VITE_LOGIN_URL',
  'VITE_LOGOUT_URL',
  'VITE_OAUTH2_AUTHORIZE_URL',
  'VITE_OAUTH2_TOKEN_URL',
  'VITE_OAUTH2_CLIENT_ID',
  'VITE_OAUTH2_SCOPE',
  'VITE_OAUTH2_TYPE',
  'VITE_OAUTH2_FLOW',
  'VITE_OAUTH2_REDIRECT_PATH',
  'VITE_OAUTH2_STORAGE',
  'VITE_ROUTER_BASENAME',
  'VITE_BASE_PATH',
  'VITE_HAVEAPI_AUTH_HEADER',
  'VITE_HAVEAPI_META_NAMESPACE',
  'VITE_UI_SETTINGS_PERSISTENCE',
  'VITE_UI_SETTINGS_SERVER_PATH',
  'VITE_UI_SETTINGS_NAMESPACE',
  'VITE_UI_SETTINGS_FIELD',
  'VITE_SERVER_TIME_ZONE',
  'VITE_PUBLIC_IPV4_WARN',
  'VITE_PUBLIC_IPV4_CRITICAL',
];

const ORIGINAL_ENV: Record<string, string | undefined> = Object.fromEntries(
  ENV_KEYS.map((k) => [k, process.env[k]])
);

afterEach(() => {
  window.vpsAdmin = undefined;
  sessionStorage.clear();

  for (const k of ENV_KEYS) {
    const v = ORIGINAL_ENV[k];
    if (typeof v === 'undefined') {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

describe('getRuntimeConfig', () => {
  it('normalizes api.version with leading "v"', () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
    };

    const cfg = getRuntimeConfig();
    expect(cfg.apiVersion).toBe('7.0');
    expect(cfg.apiBaseUrl).toBe('https://api.example.test/v7.0');
  });

  it('defaults ui settings persistence to upstream server storage', () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: '7.0' },
    };
    const cfg = getRuntimeConfig();
    expect(cfg.uiSettings.persistence).toBe('server');
    expect(cfg.uiSettings.server.path).toBe('/webui_user_settings');
    expect(cfg.uiSettings.server.namespace).toBe('ui');
  });

  it('reads ui settings persistence config from window.vpsAdmin.webuiNext', () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: '7.0' },
      webuiNext: {
        uiSettings: {
          persistence: 'server',
          server: {
            path: '/user_sessions/current/ui_setting',
            namespace: 'ui_setting',
            field: 'settings',
          },
        },
      },
    };

    const cfg = getRuntimeConfig();
    expect(cfg.uiSettings.persistence).toBe('server');
    expect(cfg.uiSettings.server.path).toBe('/user_sessions/current/ui_setting');
  });

  it('defaults ui settings server storage to upstream webui_user_settings', () => {
    process.env['VITE_UI_SETTINGS_PERSISTENCE'] = 'server';

    const cfg = getRuntimeConfig();
    expect(cfg.uiSettings.persistence).toBe('server');
    expect(cfg.uiSettings.server.path).toBe('/webui_user_settings');
    expect(cfg.uiSettings.server.namespace).toBe('ui');
    expect(cfg.uiSettings.server.field).toBe('settings');
  });

  it('reads stored OAuth2 token from sessionStorage', () => {
    process.env['VITE_API_URL'] = 'https://api.example.test';
    process.env['VITE_API_VERSION'] = '7.0';

    sessionStorage.setItem(
      'vpsadmin_ui_next.oauth2',
      JSON.stringify({ accessToken: 'oauth2-token-123', expiresAt: Date.now() + 60_000 })
    );

    const cfg = getRuntimeConfig();
    expect(cfg.auth).toEqual({ kind: 'oauth2', accessToken: 'oauth2-token-123' });
  });

  it('prefers window auth over stored auth', () => {
    sessionStorage.setItem(
      'vpsadmin_ui_next.oauth2',
      JSON.stringify({ accessToken: 'oauth2-token-123', expiresAt: Date.now() + 60_000 })
    );

    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: '7.0' },
      sessionToken: 'window-session',
    };

    const cfg = getRuntimeConfig();
    expect(cfg.auth).toEqual({ kind: 'token', sessionToken: 'window-session' });
  });

  it('reads webui url from env when window.vpsAdmin.webui is missing', () => {
    process.env['VITE_WEBUI_URL'] = 'https://vpsadmin.example.test/';
    const cfg = getRuntimeConfig();
    expect(cfg.webuiUrl).toBe('https://vpsadmin.example.test');
  });

  it('requires an explicit legacy webui URL for fallback links', () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: '7.0' },
      webui: { url: 'https://new-ui.example.test' },
    };

    expect(getRuntimeConfig().legacyWebuiUrl).toBeUndefined();

    window.vpsAdmin.webuiNext = { legacyUrl: 'https://legacy.example.test/' };
    expect(getRuntimeConfig().legacyWebuiUrl).toBe('https://legacy.example.test');
  });

  it('reads integrated BFF session expiry from window.vpsAdmin.webuiNext', () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: '7.0' },
      webuiNext: {
        sessionExpiresAt: 1_800_000_000_000,
      },
    };

    const cfg = getRuntimeConfig();
    expect(cfg.sessionExpiresAt).toBe(1_800_000_000_000);
  });

  it('reads server time zone from env', () => {
    process.env['VITE_SERVER_TIME_ZONE'] = 'UTC';
    const cfg = getRuntimeConfig();
    expect(cfg.serverTimeZone).toBe('UTC');
  });

  it('normalizes router basename', () => {
    process.env['VITE_ROUTER_BASENAME'] = '/ui-next/';
    const cfg = getRuntimeConfig();
    expect(cfg.routerBasename).toBe('/ui-next');
  });

  it('reads HaveAPI overrides from env', () => {
    process.env['VITE_HAVEAPI_AUTH_HEADER'] = 'X-My-Auth';
    process.env['VITE_HAVEAPI_META_NAMESPACE'] = '__meta';
    const cfg = getRuntimeConfig();
    expect(cfg.haveApi.authHeader).toBe('X-My-Auth');
    expect(cfg.haveApi.metaNamespace).toBe('__meta');
  });

  it('provides default public status thresholds', () => {
    const cfg = getRuntimeConfig();
    expect(cfg.publicStatus).toEqual({ ipv4Warn: 64, ipv4Critical: 16 });
  });

  it('reads public status thresholds from env and clamps critical to warn', () => {
    process.env['VITE_PUBLIC_IPV4_WARN'] = '10';
    process.env['VITE_PUBLIC_IPV4_CRITICAL'] = '50';
    const cfg = getRuntimeConfig();
    expect(cfg.publicStatus.ipv4Warn).toBe(10);
    expect(cfg.publicStatus.ipv4Critical).toBe(10);
  });

  it('prefers window public status thresholds over env', () => {
    process.env['VITE_PUBLIC_IPV4_WARN'] = '10';
    process.env['VITE_PUBLIC_IPV4_CRITICAL'] = '5';
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: '7.0' },
      webuiNext: { publicStatus: { ipv4Warn: 100, ipv4Critical: 20 } },
    };
    const cfg = getRuntimeConfig();
    expect(cfg.publicStatus.ipv4Warn).toBe(100);
    expect(cfg.publicStatus.ipv4Critical).toBe(20);
  });
});
