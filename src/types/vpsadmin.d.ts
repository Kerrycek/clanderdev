export {};

declare global {
  interface VpsAdminUiSettingsConfig {
    /** Preferred key: 'local' | 'server' */
    persistence?: 'local' | 'server';

    /** Legacy alias for persistence */
    mode?: 'local' | 'server';

    /** Nested server config (preferred) */
    server?: {
      path?: string;
      namespace?: string;
      field?: string;
    };

    /** Flat config (legacy) */
    path?: string;
    namespace?: string;
    field?: string;
  }

  interface Window {
    vpsAdmin?: {
      api: {
        url: string;
        version: string;
      };
      webui?: {
        url: string;
      };
      /** Next UI-specific runtime config */
      webuiNext?: {
        /**
         * Optional router base path (a.k.a. basename).
         *
         * Use this when the SPA is served under a sub-path, e.g.:
         *   https://vpsadmin.example.cz/ui-next/
         *
         * Then set:
         *   basePath: '/ui-next'
         */
        basePath?: string;

        /** Explicit origin of the retired PHP UI for opt-in fallback links. */
        legacyUrl?: string;

        /** Optional override for the login endpoint URL (e.g. '/login'). */
        loginUrl?: string;
        /** Optional override for the logout endpoint URL (e.g. '/logout'). */
        logoutUrl?: string;

        /** Unix timestamp in milliseconds when the integrated BFF session expires. */
        sessionExpiresAt?: number | null;

        /** Optional HaveAPI client overrides for standalone deployments */
        haveApi?: {
          /**
           * Force the auth header name.
           * Useful when `window.vpsAdmin.description` is not available.
           */
          authHeader?: string;

          /** Force meta namespace (default is `_meta`). */
          metaNamespace?: string;
        };

        /** Optional OAuth2 client overrides for standalone deployments */
        oauth2?: {
          authorizeUrl?: string;
          tokenUrl?: string;
          clientId?: string;
          scope?: string;
          type?: string;
          flow?: 'pkce' | 'implicit';
          redirectPath?: string;
          storage?: 'session' | 'local';
        };

        /** Optional public-status landing thresholds */
        publicStatus?: {
          ipv4Warn?: number;
          ipv4Critical?: number;
        };

        /** Server default time zone, used to suppress equivalent browser time-zone tips. */
        serverTimeZone?: string;

        uiSettings?: VpsAdminUiSettingsConfig;
      };

      /** Legacy placement of UI settings config */
      uiSettings?: VpsAdminUiSettingsConfig;

      /** Server default time zone, used to suppress equivalent browser time-zone tips. */
      serverTimeZone?: string;
      accessToken?: string;
      sessionToken?: string;
      sessionLength?: number;
      description?: unknown;
      sessionManagement?: boolean;
    };
  }
}
