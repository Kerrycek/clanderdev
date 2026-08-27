import React from 'react';
import { ExternalLink, Loader2, MapPin } from 'lucide-react';

import { useI18n } from '../../../app/i18n';

type OsmPoint = {
  lat: number;
  lon: number;
};

type NominatimPlace = {
  lat?: string;
  lon?: string;
};

export function openStreetMapAddressUrl(address: unknown): string | null {
  const normalized = String(address ?? '').trim();
  if (!normalized) return null;

  const url = new URL('https://www.openstreetmap.org/search');
  url.searchParams.set('query', normalized);
  return url.toString();
}

export function openStreetMapEmbedUrl(point: OsmPoint | null): string | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;

  const delta = 0.003;
  const url = new URL('https://www.openstreetmap.org/export/embed.html');
  url.searchParams.set(
    'bbox',
    [
      (point.lon - delta).toFixed(6),
      (point.lat - delta).toFixed(6),
      (point.lon + delta).toFixed(6),
      (point.lat + delta).toFixed(6),
    ].join(',')
  );
  url.searchParams.set('layer', 'mapnik');
  url.searchParams.set('marker', `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`);
  return url.toString();
}

export function nominatimSearchUrl(address: string): string {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', address);
  return url.toString();
}

function parseNominatimPoint(places: unknown): OsmPoint | null {
  const first = Array.isArray(places) ? (places[0] as NominatimPlace | undefined) : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function useOsmPoint(address: string, enabled: boolean) {
  const [point, setPoint] = React.useState<OsmPoint | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!address || !enabled) {
      setPoint(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setPoint(null);
    setLoading(true);

    fetch(nominatimSearchUrl(address), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
        return res.json();
      })
      .then((json) => setPoint(parseNominatimPoint(json)))
      .catch((err) => {
        if ((err as { name?: string }).name !== 'AbortError') setPoint(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [address, enabled]);

  return { point, loading };
}

export function RequestAddressMapLink(props: { address: unknown; testId?: string }) {
  const { t } = useI18n();
  const address = String(props.address ?? '').trim();
  const href = openStreetMapAddressUrl(address);
  const [previewRequested, setPreviewRequested] = React.useState(false);
  const { point, loading } = useOsmPoint(address, previewRequested);
  const embedHref = React.useMemo(() => openStreetMapEmbedUrl(point), [point]);

  if (!href) return <div className="text-sm">—</div>;

  return (
    <div
      data-testid={props.testId}
      className="mt-1 overflow-hidden rounded-lg border border-border bg-surface-2 shadow-sm"
    >
      {embedHref ? (
        <iframe
          title={t('requests.detail.address_map.preview_title')}
          src={embedHref}
          loading="lazy"
          referrerPolicy="no-referrer"
          data-testid={`${props.testId ?? 'requests.detail.address_map'}.preview`}
          className="h-44 w-full border-0 bg-surface-1"
        />
      ) : (
        <div className="flex min-h-24 flex-col items-center justify-center gap-2 bg-surface-1 px-4 py-3 text-center text-xs text-muted">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <MapPin className="h-4 w-4" aria-hidden="true" />
          )}
          <span>
            {loading
              ? t('requests.detail.address_map.loading')
              : previewRequested
                ? t('requests.detail.address_map.preview_unavailable')
                : t('requests.detail.address_map.preview_prompt')}
          </span>
          {!previewRequested ? (
            <button
              type="button"
              onClick={() => setPreviewRequested(true)}
              data-testid={`${props.testId ?? 'requests.detail.address_map'}.load_preview`}
              className="rounded-md border border-border bg-surface-2 px-3 py-1.5 font-medium text-fg transition hover:bg-accent-soft focus:outline-none focus:ring-2 focus:ring-focus/35"
            >
              {t('requests.detail.address_map.load_preview')}
            </button>
          ) : null}
        </div>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('requests.detail.address_map.aria', { address })}
        data-testid={`${props.testId ?? 'requests.detail.address_map'}.link`}
        className="group flex items-center gap-3 px-3 py-2.5 transition hover:bg-accent-soft/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-focus/35"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block whitespace-pre-line text-sm font-medium text-fg">{address}</span>
          <span className="mt-0.5 block text-xs text-muted group-hover:text-accent">
            {t('requests.detail.address_map.open')}
          </span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-faint group-hover:text-accent" aria-hidden="true" />
      </a>
    </div>
  );
}
