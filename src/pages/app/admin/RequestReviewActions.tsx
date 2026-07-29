import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useChrome } from '../../../components/layout/ChromeContext';
import { useI18n } from '../../../app/i18n';
import { useToasts } from '../../../app/toasts';

import { fetchNodes, type Node } from '../../../lib/api/nodes';
import { getMetaActionStateId } from '../../../lib/api/haveapi';
import {
  resolveChangeRequest,
  resolveRegistrationRequest,
  type ResolveUserRequestAction,
} from '../../../lib/api/requests';

import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { LinkButton } from '../../../components/ui/LinkButton';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { RequestResolveReview } from './RequestResolveReview';
import type { RequestResolveOverrides, RequestReviewType, ReviewableRequest } from './RequestReviewTypes';
import {
  emptyRequestOverrides,
  requestActionNeedsReason,
  requestActionVariant,
  requestOperationalLinks,
  requestOverrides,
  requestReviewActions,
  safePositiveInteger,
} from './RequestReviewModel';

export type { RequestReviewType, ReviewableRequest } from './RequestReviewTypes';
export {
  firstResourceId,
  requestOperationalLinks,
  requestReviewActions,
  resourceId,
} from './RequestReviewModel';

export function RequestOperationalLinks(props: {
  request: ReviewableRequest | undefined;
  basePath: string;
  compact?: boolean;
  testIdPrefix: string;
}) {
  const { t } = useI18n();
  const { actionStateId, transactionChainId, transactionId } = requestOperationalLinks(props.request);
  if (!actionStateId && !transactionChainId && !transactionId) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid={`${props.testIdPrefix}.ops`}>
      {actionStateId ? (
        <LinkButton
          to={`${props.basePath}/action-states/${actionStateId}`}
          variant="secondary"
          size={props.compact ? 'sm' : undefined}
          testId={`${props.testIdPrefix}.ops.action_state`}
        >
          {t('common.action_state')} #{actionStateId}
        </LinkButton>
      ) : null}
      {transactionChainId ? (
        <LinkButton
          to={`${props.basePath}/transactions/${transactionChainId}`}
          variant="secondary"
          size={props.compact ? 'sm' : undefined}
          testId={`${props.testIdPrefix}.ops.chain`}
        >
          {t('common.open_chain')}
        </LinkButton>
      ) : null}
      {transactionId ? (
        <LinkButton
          to={`${props.basePath}/transactions/items/${transactionId}`}
          variant="secondary"
          size={props.compact ? 'sm' : undefined}
          testId={`${props.testIdPrefix}.ops.transaction`}
        >
          {t('common.open_transaction')}
        </LinkButton>
      ) : null}
    </div>
  );
}

export function RequestReviewActions(props: {
  request: ReviewableRequest;
  reqType: RequestReviewType;
  reqId: number;
  isAdmin: boolean;
  basePath: string;
  testIdPrefix: string;
  compact?: boolean;
  showDetailLink?: boolean;
  onResolved?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const toasts = useToasts();
  const chrome = useChrome();
  const qc = useQueryClient();

  const actions = useMemo(() => requestReviewActions(props.request, props.isAdmin), [props.isAdmin, props.request]);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveAction, setResolveAction] = useState<ResolveUserRequestAction>('approve');
  const [resolveReason, setResolveReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [oLogin, setOLogin] = useState('');
  const [oFullName, setOFullName] = useState('');
  const [oOrgName, setOOrgName] = useState('');
  const [oOrgId, setOOrgId] = useState('');
  const [oEmail, setOEmail] = useState('');
  const [oAddress, setOAddress] = useState('');
  const [oChangeReason, setOChangeReason] = useState('');

  const [approveCreateVps, setApproveCreateVps] = useState(true);
  const [approveActivate, setApproveActivate] = useState(true);
  const [approveNode, setApproveNode] = useState('');

  const nodesQ = useQuery({
    queryKey: ['nodes', 'index', { limit: 200 }],
    enabled: resolveOpen && props.reqType === 'registration' && resolveAction === 'approve',
    queryFn: async () => (await fetchNodes({ limit: 200 })).data,
  });

  const nodes = nodesQ.data ?? [];
  const requiresReason = requestActionNeedsReason(resolveAction);
  const reasonMissing = requiresReason && !resolveReason.trim();
  const canSubmit = !submitting && !reasonMissing;

  function setOverrideState(overrides: RequestResolveOverrides) {
    setOLogin(overrides.login);
    setOFullName(overrides.fullName);
    setOOrgName(overrides.orgName);
    setOOrgId(overrides.orgId);
    setOEmail(overrides.email);
    setOAddress(overrides.address);
    setOChangeReason(overrides.changeReason);
  }

  function openAction(action: ResolveUserRequestAction) {
    setResolveAction(action);
    setResolveReason('');
    setOverrideState(
      action === 'request_correction'
        ? requestOverrides(props.reqType, props.request)
        : emptyRequestOverrides(),
    );

    setResolveOpen(true);
  }

  async function submitResolveAction(
    action: ResolveUserRequestAction,
    options: {
      reason: string | undefined;
      overrides: RequestResolveOverrides;
      approveCreateVps: boolean;
      approveActivate: boolean;
      approveNode: string;
    }
  ) {
    setSubmitting(true);

    try {
      if (props.reqType === 'registration') {
        const p: Parameters<typeof resolveRegistrationRequest>[1] = { action, reason: options.reason };

        if (options.overrides.login.trim()) p.login = options.overrides.login.trim();
        if (options.overrides.fullName.trim()) p.full_name = options.overrides.fullName.trim();
        if (options.overrides.orgName.trim()) p.org_name = options.overrides.orgName.trim();
        if (options.overrides.orgId.trim()) p.org_id = options.overrides.orgId.trim();
        if (options.overrides.email.trim()) p.email = options.overrides.email.trim();
        if (options.overrides.address.trim()) p.address = options.overrides.address.trim();

        if (action === 'approve') {
          p.create_vps = options.approveCreateVps;
          p.activate = options.approveActivate;
          const nodeId = safePositiveInteger(options.approveNode);
          if (nodeId) p.node = nodeId;
        }

        const res = await resolveRegistrationRequest(props.reqId, p);
        const asId = getMetaActionStateId(res.meta);
        if (asId) chrome.trackActionState(asId);
      } else {
        const p: Parameters<typeof resolveChangeRequest>[1] = { action, reason: options.reason };

        if (options.overrides.fullName.trim()) p.full_name = options.overrides.fullName.trim();
        if (options.overrides.email.trim()) p.email = options.overrides.email.trim();
        if (options.overrides.address.trim()) p.address = options.overrides.address.trim();
        if (options.overrides.changeReason.trim()) p.change_reason = options.overrides.changeReason.trim();

        const res = await resolveChangeRequest(props.reqId, p);
        const asId = getMetaActionStateId(res.meta);
        if (asId) chrome.trackActionState(asId);
      }

      toasts.pushToast({
        variant: 'ok',
        title: t('requests.resolve.toast.title'),
        body: t('requests.resolve.toast.message'),
      });

      setResolveOpen(false);
      await qc.invalidateQueries({ queryKey: ['user_request'] });
      await props.onResolved?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toasts.pushToast({
        variant: 'danger',
        title: t('requests.resolve.toast.error.title'),
        body: message,
        autoDismissMs: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitResolve() {
    if (!canSubmit) return;

    await submitResolveAction(resolveAction, {
      reason: resolveReason.trim() || undefined,
      overrides: {
        login: oLogin,
        fullName: oFullName,
        orgName: oOrgName,
        orgId: oOrgId,
        email: oEmail,
        address: oAddress,
        changeReason: oChangeReason,
      },
      approveCreateVps,
      approveActivate,
      approveNode,
    });
  }

  if (!actions.length) {
    return props.isAdmin ? (
      <div className="text-sm text-muted" data-testid={`${props.testIdPrefix}.actions.none`}>
        {t('requests.resolve.unavailable')}
      </div>
    ) : null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid={`${props.testIdPrefix}.actions`}>
        {actions.map((action) => (
          <Button
            key={action}
            variant={requestActionVariant(action)}
            size={props.compact ? 'sm' : undefined}
            onClick={() => openAction(action)}
            disabled={submitting}
            testId={`${props.testIdPrefix}.action.${action}`}
          >
            {t(`requests.resolve.action.${action}`)}
          </Button>
        ))}
        {props.showDetailLink ? (
          <Link className="text-sm text-accent hover:underline" to={`${props.basePath}/requests/${props.reqType}/${props.reqId}`}>
            {t('requests.detail.open_full')}
          </Link>
        ) : null}
      </div>

      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title={t('requests.resolve.modal.title')}
        size="lg"
        testId={`${props.testIdPrefix}.modal`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setResolveOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={requestActionVariant(resolveAction)}
              onClick={submitResolve}
              loading={submitting}
              disabled={!canSubmit}
              testId={`${props.testIdPrefix}.submit`}
            >
              {t('requests.resolve.modal.submit')}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium">{t('requests.resolve.action')}</div>
            <Select
              value={resolveAction}
              onChange={(e) => {
                const next = e.target.value as ResolveUserRequestAction;
                setResolveAction(next);
                setOverrideState(
                  next === 'request_correction'
                    ? requestOverrides(props.reqType, props.request)
                    : emptyRequestOverrides(),
                );
              }}
              testId={`${props.testIdPrefix}.action_select`}
            >
              {actions.map((action) => (
                <option key={action} value={action}>
                  {t(`requests.resolve.action.${action}`)}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="text-sm font-medium">{t('requests.resolve.reason')}</div>
            <Textarea
              value={resolveReason}
              onChange={(e) => setResolveReason(e.target.value)}
              rows={3}
              testId={`${props.testIdPrefix}.reason`}
            />
            {reasonMissing ? <div className="mt-1 text-xs text-danger">{t('requests.resolve.reason_required')}</div> : null}
          </div>
        </div>

        <RequestResolveReview
          request={props.request}
          reqType={props.reqType}
          reqId={props.reqId}
          action={resolveAction}
          requiresReason={requiresReason}
          approveCreateVps={approveCreateVps}
          approveActivate={approveActivate}
          approveNode={approveNode}
          overrides={{
            login: oLogin,
            fullName: oFullName,
            orgName: oOrgName,
            orgId: oOrgId,
            email: oEmail,
            address: oAddress,
            changeReason: oChangeReason,
          }}
          testIdPrefix={props.testIdPrefix}
        />

        {props.reqType === 'registration' && resolveAction === 'approve' ? (
          <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-sm font-medium">{t('requests.resolve.approve.options')}</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={approveCreateVps}
                  onChange={(e) => setApproveCreateVps(e.target.checked)}
                  data-testid={`${props.testIdPrefix}.create_vps`}
                />
                {t('requests.resolve.approve.create_vps')}
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={approveActivate}
                  onChange={(e) => setApproveActivate(e.target.checked)}
                  data-testid={`${props.testIdPrefix}.activate`}
                />
                {t('requests.resolve.approve.activate')}
              </label>

              <div className="md:col-span-2">
                <div className="text-xs text-muted">{t('requests.resolve.approve.node')}</div>
                <Select value={approveNode} onChange={(e) => setApproveNode(e.target.value)}>
                  <option value="">{t('common.auto')}</option>
                  {nodes.map((n: Node) => (
                    <option key={n.id} value={String(n.id)}>
                      #{n.id} {n.domain_name ?? n.name ?? ''}
                    </option>
                  ))}
                </Select>
                {nodesQ.isError ? <div className="mt-1 text-xs text-danger">{t('requests.resolve.nodes_load_error')}</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-accent">{t('requests.resolve.overrides')}</summary>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {props.reqType === 'registration' ? (
              <>
                <Input
                  value={oLogin}
                  onChange={(e) => setOLogin(e.target.value)}
                  placeholder={t('requests.override.login')}
                  testId={`${props.testIdPrefix}.override.login`}
                />
                <Input
                  value={oFullName}
                  onChange={(e) => setOFullName(e.target.value)}
                  placeholder={t('requests.override.full_name')}
                  testId={`${props.testIdPrefix}.override.full_name`}
                />
                <Input
                  value={oOrgName}
                  onChange={(e) => setOOrgName(e.target.value)}
                  placeholder={t('requests.override.org_name')}
                  testId={`${props.testIdPrefix}.override.org_name`}
                />
                <Input
                  value={oOrgId}
                  onChange={(e) => setOOrgId(e.target.value)}
                  placeholder={t('requests.override.org_id')}
                  testId={`${props.testIdPrefix}.override.org_id`}
                />
                <Input
                  value={oEmail}
                  onChange={(e) => setOEmail(e.target.value)}
                  placeholder={t('requests.override.email')}
                  testId={`${props.testIdPrefix}.override.email`}
                />
                <Input
                  value={oAddress}
                  onChange={(e) => setOAddress(e.target.value)}
                  placeholder={t('requests.override.address')}
                  testId={`${props.testIdPrefix}.override.address`}
                />
              </>
            ) : (
              <>
                <Input
                  value={oFullName}
                  onChange={(e) => setOFullName(e.target.value)}
                  placeholder={t('requests.override.full_name')}
                  testId={`${props.testIdPrefix}.override.full_name`}
                />
                <Input
                  value={oEmail}
                  onChange={(e) => setOEmail(e.target.value)}
                  placeholder={t('requests.override.email')}
                  testId={`${props.testIdPrefix}.override.email`}
                />
                <Input
                  value={oAddress}
                  onChange={(e) => setOAddress(e.target.value)}
                  placeholder={t('requests.override.address')}
                  testId={`${props.testIdPrefix}.override.address`}
                />
                <Input
                  value={oChangeReason}
                  onChange={(e) => setOChangeReason(e.target.value)}
                  placeholder={t('requests.override.change_reason')}
                  testId={`${props.testIdPrefix}.override.change_reason`}
                />
              </>
            )}
          </div>
        </details>
      </Modal>
    </>
  );
}
