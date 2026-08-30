import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

import { useAuth } from '../../app/auth';
import { useI18n } from '../../app/i18n';
import { useTheme } from '../../app/theme';
import {
  fetchContextualHelpBoxes,
  type ContextualHelpAccessMode,
} from '../../lib/api/helpBoxes';
import { buildHelpBoxesManageUrl, resolveHelpBoxContext, type HelpBoxScope } from '../../lib/helpBoxContext';
import { Button } from '../ui/Button';
import { buttonClassName } from '../ui/buttonStyles';
import { Badge } from '../ui/Badge';
import { SandboxedHtml } from '../ui/SandboxedHtml';

const expandedStorageKey = 'vpsadmin.contextualHelp.expanded.v1';
const helpBoxMaxHeightPx = 448;

function loadExpandedPreference(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(expandedStorageKey) === '1';
  } catch {
    return false;
  }
}

function saveExpandedPreference(expanded: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(expandedStorageKey, expanded ? '1' : '0');
  } catch {
    // Ignore storage failures and fall back to in-memory state.
  }
}

function normalizeIdPart(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

export function ContextualHelpPanel(props: {
  pathname: string;
  scope: HelpBoxScope;
}) {
  const { t } = useI18n();
  const auth = useAuth();
  const theme = useTheme();
  const [expanded, setExpanded] = useState<boolean>(() => loadExpandedPreference());

  const ctx = useMemo(() => resolveHelpBoxContext(props.pathname, props.scope), [props.pathname, props.scope]);
  const accessMode: ContextualHelpAccessMode | null =
    auth.status === 'authenticated'
      ? 'authenticated'
      : auth.status === 'anonymous'
        ? 'public'
        : null;

  const q = useQuery({
    queryKey: [
      'help_boxes',
      'view',
      props.scope,
      ctx?.page ?? null,
      ctx?.action ?? null,
      accessMode,
    ],
    enabled: Boolean(ctx?.page && ctx?.action && accessMode),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async () =>
      (await fetchContextualHelpBoxes(ctx!.page, ctx!.action, accessMode!)).data,
  });

  const boxes = useMemo(
    () =>
      (q.data ?? [])
        .slice()
        .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)),
    [q.data]
  );

  const contentId = useMemo(
    () =>
      ctx
        ? `contextual-help-${normalizeIdPart(props.scope)}-${normalizeIdPart(ctx.page)}-${normalizeIdPart(ctx.action)}`
        : undefined,
    [ctx, props.scope]
  );

  useEffect(() => {
    saveExpandedPreference(expanded);
  }, [expanded]);

  if (!ctx) return null;
  if (q.isLoading && !q.data) return null;
  if (q.isError || boxes.length === 0) return null;

  const canManage = auth.status === 'authenticated' && auth.canUseAdminUi;
  const manageUrl = canManage ? buildHelpBoxesManageUrl(ctx) : null;

  return (
    <section
      data-testid="contextual.help.panel"
      className="overflow-hidden rounded-lg border border-border bg-surface/70 shadow-card"
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-info-border bg-info-bg text-info">
              <Info className="h-4 w-4" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-fg">{t('help_boxes.panel.title')}</div>
                <Badge variant="info">{boxes.length}</Badge>

                {canManage ? (
                  <div className="hidden sm:flex items-center gap-2">
                    <Badge variant="neutral">{ctx.page}</Badge>
                    <Badge variant="neutral">{ctx.action}</Badge>
                  </div>
                ) : null}
              </div>

              <div className="mt-1 text-sm text-muted">{t('help_boxes.panel.subtitle')}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button
                to={manageUrl!}
                variant="ghost"
                size="sm"
                className="text-muted hover:text-fg"
                testId="contextual.help.manage"
              >
                {t('help_boxes.panel.manage')}
              </Button>
            ) : null}

            <button
              type="button"
              data-testid="contextual.help.toggle"
              className={buttonClassName({
                variant: expanded ? 'secondary' : 'ghost',
                size: 'sm',
                className: expanded ? undefined : 'text-muted hover:text-fg',
              })}
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? t('common.collapse') : t('common.expand')}
            </button>
          </div>
        </div>

        {expanded ? (
          <div id={contentId} className="border-t border-border pt-3">
            <div className="space-y-3">
              {boxes.map((box) => (
                <div
                  key={box.id}
                  className="overflow-hidden rounded-md border border-border bg-surface/50"
                  data-testid={`contextual.help.box.${box.id}`}
                >
                  <SandboxedHtml
                    html={String(box.content ?? '')}
                    title={t('help_boxes.panel.iframe_title', { id: box.id })}
                    autoHeight
                    maxAutoHeight={helpBoxMaxHeightPx}
                    variant="helpBox"
                    theme={theme.effective}
                    className="min-h-0"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
