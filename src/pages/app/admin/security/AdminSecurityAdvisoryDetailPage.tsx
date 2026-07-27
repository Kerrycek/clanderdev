import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import { useChrome } from '../../../../components/layout/ChromeContext';
import { Alert } from '../../../../components/ui/Alert';
import { LoadingState } from '../../../../components/ui/LoadingState';
import {
  advisoryCveLabels,
  createSecurityAdvisoryOutageLink,
  createSecurityAdvisoryUpdate,
  deleteSecurityAdvisoryOutageLink,
  fetchSecurityAdvisory,
  fetchAllSecurityAdvisoryUpdates,
  fetchSecurityAdvisoryNodeStatuses,
  fetchSecurityAdvisoryOutageLinks,
  publishSecurityAdvisory,
  rebuildSecurityAdvisoryAffectedVps,
  updateSecurityAdvisory,
  type SecurityAdvisoryOutageLink,
} from '../../../../lib/api/securityAdvisories';
import { fetchLanguages } from '../../../../lib/api/languages';
import { fetchNodes } from '../../../../lib/api/nodes';
import { getMetaActionStateId } from '../../../../lib/api/haveapi';
import { isoToLocalInput, localInputToIso } from '../../../../lib/datetimeLocal';
import { formatErrorMessage } from '../../../../lib/errors';
import {
  fetchAllSecurityAdvisoryAffectedUsersForAdmin,
  fetchAllSecurityAdvisoryAffectedVpsForAdmin,
  fetchAllSecurityAdvisoryCvesForAdmin,
  reconcileSecurityAdvisoryCves,
} from './securityAdvisoryAdminApi';
import {
  canEditSecurityAdvisory,
  canPostSecurityAdvisoryUpdate,
  resourceId,
  securityAdvisoryPublishIssues,
} from './securityAdvisoryAdminModel';
import {
  securityAdvisoryEditorPayload,
  type SecurityAdvisoryEditorValues,
} from './SecurityAdvisoryEditorModal';
import {
  securityAdvisoryUpdateCreatePayload,
  type SecurityAdvisoryUpdateValues,
} from './SecurityAdvisoryUpdateModal';
import { SecurityAdvisoryAffectedPanel } from './SecurityAdvisoryAffectedPanel';
import { SecurityAdvisoryDetailDialogs } from './SecurityAdvisoryDetailDialogs';
import { SecurityAdvisoryDetailHeader } from './SecurityAdvisoryDetailHeader';
import { SecurityAdvisoryNodesPanel } from './SecurityAdvisoryNodesPanel';
import { SecurityAdvisoryOutagesPanel } from './SecurityAdvisoryOutagesPanel';
import { SecurityAdvisoryOverviewPanel } from './SecurityAdvisoryOverviewPanel';
import { SecurityAdvisoryUpdatesPanel } from './SecurityAdvisoryUpdatesPanel';
import { DETAIL_TABS, type DetailTab } from './securityAdvisoryDetailViewModel';

export function AdminSecurityAdvisoryDetailPage() {
  const params = useParams();
  const advisoryId = Number(params['advisoryId']);
  const validId = Number.isInteger(advisoryId) && advisoryId > 0;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as DetailTab | null;
  const activeTab: DetailTab = requestedTab && DETAIL_TABS.includes(requestedTab) ? requestedTab : 'overview';
  const i18n = useI18n();
  const { t } = i18n;
  const { pushToast } = useToasts();
  const chrome = useChrome();
  const queryClient = useQueryClient();

  const advisoryQ = useQuery({
    queryKey: ['security_advisory', advisoryId],
    queryFn: async () => (await fetchSecurityAdvisory(advisoryId, { includes: 'created_by,published_by' })).data,
    enabled: validId,
    refetchOnWindowFocus: false,
  });
  const languagesQ = useQuery({
    queryKey: ['languages', { limit: 100 }],
    queryFn: async () => (await fetchLanguages({ limit: 100 })).data,
    refetchOnWindowFocus: false,
  });
  const cvesQ = useQuery({
    queryKey: ['security_advisory_cves', advisoryId],
    queryFn: () => fetchAllSecurityAdvisoryCvesForAdmin(advisoryId),
    enabled: validId,
    refetchOnWindowFocus: false,
  });
  const nodesQ = useQuery({
    queryKey: ['nodes', 'security_advisory_relevant'],
    queryFn: async () => (await fetchNodes({ limit: 1000, state: 'active' })).data,
    refetchOnWindowFocus: false,
  });
  const statusesQ = useQuery({
    queryKey: ['security_advisory_node_statuses', advisoryId],
    queryFn: async () => (
      await fetchSecurityAdvisoryNodeStatuses(advisoryId, { limit: 1000, includes: 'node' })
    ).data,
    enabled: validId,
    refetchOnWindowFocus: false,
  });
  const updatesQ = useQuery({
    queryKey: ['security_advisory_updates', advisoryId],
    queryFn: async () => (
      await fetchAllSecurityAdvisoryUpdates({ securityAdvisoryId: advisoryId, limit: 100, includes: 'reported_by' })
    ).data,
    enabled: validId,
    refetchOnWindowFocus: false,
  });
  const affectedUsersQ = useQuery({
    queryKey: ['security_advisory_affected_users', advisoryId],
    queryFn: () => fetchAllSecurityAdvisoryAffectedUsersForAdmin(advisoryId),
    enabled: validId && activeTab === 'affected',
    refetchOnWindowFocus: false,
  });
  const affectedVpsQ = useQuery({
    queryKey: ['security_advisory_affected_vps', advisoryId],
    queryFn: () => fetchAllSecurityAdvisoryAffectedVpsForAdmin(advisoryId),
    enabled: validId && activeTab === 'affected',
    refetchOnWindowFocus: false,
  });
  const outagesQ = useQuery({
    queryKey: ['security_advisory_outage_links', advisoryId],
    queryFn: async () => (
      await fetchSecurityAdvisoryOutageLinks({ securityAdvisoryId: advisoryId, limit: 100, includes: 'outage' })
    ).data,
    enabled: validId,
    refetchOnWindowFocus: false,
  });
  const languagesReady = Boolean(languagesQ.data?.length) && !languagesQ.isError;
  const cvesReady = cvesQ.isSuccess;
  const readinessDataReady = cvesQ.isSuccess && nodesQ.isSuccess && statusesQ.isSuccess;

  const cveLabels = useMemo(
    () => advisoryCveLabels({ id: advisoryId, cves: cvesQ.data ?? [] }),
    [advisoryId, cvesQ.data],
  );
  const readinessIssues = useMemo(
    () => securityAdvisoryPublishIssues({ cves: cveLabels, nodes: nodesQ.data ?? [], statuses: statusesQ.data ?? [] }),
    [cveLabels, nodesQ.data, statusesQ.data],
  );
  const updates = useMemo(
    () => (updatesQ.data ?? []).slice().sort((a, b) => {
      const aTime = new Date(a.created_at ?? a.updated_at ?? 0).getTime();
      const bTime = new Date(b.created_at ?? b.updated_at ?? 0).getTime();
      return bTime - aTime;
    }),
    [updatesQ.data],
  );

  const invalidateDetail = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['security_advisory', advisoryId] }),
      queryClient.invalidateQueries({ queryKey: ['security_advisory_cves', advisoryId] }),
      queryClient.invalidateQueries({ queryKey: ['security_advisory_node_statuses', advisoryId] }),
      queryClient.invalidateQueries({ queryKey: ['security_advisory_updates', advisoryId] }),
      queryClient.invalidateQueries({ queryKey: ['security_advisory_outage_links', advisoryId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'security_advisories'] }),
    ]);
  };

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const editM = useMutation({
    mutationFn: async ({ values, cves }: { values: SecurityAdvisoryEditorValues; cves: string[] }) => {
      const freshAdvisory = (await fetchSecurityAdvisory(advisoryId)).data;
      if (!canEditSecurityAdvisory(freshAdvisory.state)) {
        setEditorOpen(false);
        await queryClient.invalidateQueries({ queryKey: ['security_advisory', advisoryId] });
        throw new Error(t('admin.security_advisories.validation.parent_locked'));
      }
      const updated = await updateSecurityAdvisory(advisoryId, securityAdvisoryEditorPayload(values));
      try {
        await reconcileSecurityAdvisoryCves(advisoryId, cvesQ.data ?? [], cves);
        return { advisory: updated.data, childError: null };
      } catch (error) {
        return { advisory: updated.data, childError: formatErrorMessage(error) };
      }
    },
    onSuccess: async ({ childError }) => {
      await invalidateDetail();
      setEditorOpen(false);
      setEditorError(null);
      pushToast(
        childError
          ? { variant: 'warn', title: t('admin.security_advisories.toast.saved_without_cves'), body: childError }
          : { variant: 'ok', title: t('admin.security_advisories.toast.saved') },
      );
    },
    onError: (error) => {
      const message = formatErrorMessage(error);
      setEditorError(message);
      pushToast({ variant: 'danger', title: t('admin.security_advisories.toast.save_failed'), body: message });
    },
  });

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [publishMail, setPublishMail] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const openPublish = () => {
    setPublishAt(isoToLocalInput(advisoryQ.data?.published_at || new Date().toISOString()));
    setPublishMail(false);
    setPublishError(null);
    setPublishOpen(true);
  };
  // audit:ignore trackActionState-no-object -- security advisories are not a supported Chrome object lock.
  const publishM = useMutation({
    mutationFn: async () => {
      const freshAdvisory = (await fetchSecurityAdvisory(advisoryId)).data;
      if (String(freshAdvisory.state ?? '') !== 'draft') {
        setPublishOpen(false);
        await queryClient.invalidateQueries({ queryKey: ['security_advisory', advisoryId] });
        throw new Error(t('admin.security_advisories.validation.parent_locked'));
      }
      const parsed = localInputToIso(publishAt);
      if (!parsed.valid) throw new Error(t('admin.security_advisories.validation.date'));
      return publishSecurityAdvisory(advisoryId, { send_mail: publishMail, published_at: parsed.iso ?? null });
    },
    onSuccess: async (result) => {
      const actionStateId = getMetaActionStateId(result.meta);
      if (actionStateId) chrome.trackActionState(actionStateId);
      setPublishOpen(false);
      setPublishError(null);
      await invalidateDetail();
      pushToast({ variant: 'ok', title: t('admin.security_advisories.toast.published') });
    },
    onError: (error) => {
      const message = formatErrorMessage(error);
      setPublishError(message);
      pushToast({ variant: 'danger', title: t('admin.security_advisories.toast.publish_failed'), body: message });
    },
  });

  const [rebuildOpen, setRebuildOpen] = useState(false);
  const rebuildM = useMutation({
    mutationFn: () => rebuildSecurityAdvisoryAffectedVps(advisoryId),
    onSuccess: async () => {
      setRebuildOpen(false);
      await Promise.all([
        invalidateDetail(),
        queryClient.invalidateQueries({ queryKey: ['security_advisory_affected_users', advisoryId] }),
        queryClient.invalidateQueries({ queryKey: ['security_advisory_affected_vps', advisoryId] }),
      ]);
      pushToast({ variant: 'ok', title: t('admin.security_advisories.toast.rebuilt') });
    },
    onError: (error) => pushToast({ variant: 'danger', title: t('admin.security_advisories.toast.rebuild_failed'), body: formatErrorMessage(error) }),
  });

  const [updateEditorOpen, setUpdateEditorOpen] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<SecurityAdvisoryUpdateValues | null>(null);
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  // audit:ignore trackActionState-no-object -- advisory updates are not a supported Chrome object lock.
  const createUpdateM = useMutation({
    mutationFn: async (values: SecurityAdvisoryUpdateValues) => {
      const freshAdvisory = (await fetchSecurityAdvisory(advisoryId)).data;
      const parentState = freshAdvisory.state;
      if (String(parentState ?? '') !== 'published') {
        setUpdateEditorOpen(false);
        setUpdateConfirmOpen(false);
        setPendingUpdate(null);
        await queryClient.invalidateQueries({ queryKey: ['security_advisory', advisoryId] });
        throw new Error(t('admin.security_advisories.update.lifecycle_unavailable_body'));
      }
      return createSecurityAdvisoryUpdate(
        securityAdvisoryUpdateCreatePayload(advisoryId, values, parentState),
      );
    },
    onSuccess: async (result) => {
      const actionStateId = getMetaActionStateId(result.meta);
      if (actionStateId) chrome.trackActionState(actionStateId);
      setUpdateEditorOpen(false);
      setUpdateConfirmOpen(false);
      setPendingUpdate(null);
      setUpdateError(null);
      await invalidateDetail();
      pushToast({ variant: 'ok', title: t('admin.security_advisories.toast.update_posted') });
    },
    onError: (error) => {
      const message = formatErrorMessage(error);
      setUpdateError(message);
      setUpdateConfirmOpen(false);
      pushToast({ variant: 'danger', title: t('admin.security_advisories.toast.update_failed'), body: message });
    },
  });
  const submitUpdate = (values: SecurityAdvisoryUpdateValues) => {
    if (values.state === 'retracted' || values.sendMail) {
      setPendingUpdate(values);
      setUpdateConfirmOpen(true);
      return;
    }
    createUpdateM.mutate(values);
  };

  const [outageId, setOutageId] = useState('');
  const linkOutageM = useMutation({
    mutationFn: async () => {
      const id = Number(outageId);
      if (!Number.isInteger(id) || id <= 0) throw new Error(t('admin.security_advisories.outages.invalid_id'));
      const duplicate = (outagesQ.data ?? []).some((link) => resourceId(link.outage, link.outage_id) === id);
      if (duplicate) throw new Error(t('admin.security_advisories.outages.duplicate'));
      return createSecurityAdvisoryOutageLink({ outage: id, security_advisory: advisoryId });
    },
    onSuccess: async () => {
      setOutageId('');
      await invalidateDetail();
      pushToast({ variant: 'ok', title: t('admin.security_advisories.toast.outage_linked') });
    },
    onError: (error) => pushToast({ variant: 'danger', title: t('admin.security_advisories.toast.outage_link_failed'), body: formatErrorMessage(error) }),
  });
  const [unlinkTarget, setUnlinkTarget] = useState<SecurityAdvisoryOutageLink | null>(null);
  const unlinkOutageM = useMutation({
    mutationFn: () => {
      if (!unlinkTarget) throw new Error('Missing outage link');
      return deleteSecurityAdvisoryOutageLink(unlinkTarget.id);
    },
    onSuccess: async () => {
      setUnlinkTarget(null);
      await invalidateDetail();
      pushToast({ variant: 'ok', title: t('admin.security_advisories.toast.outage_unlinked') });
    },
    onError: (error) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(error) }),
  });

  if (!validId) return <Alert variant="danger" title={t('common.error')}>{t('admin.security_advisories.invalid_id')}</Alert>;
  if (advisoryQ.isLoading) return <LoadingState />;
  if (advisoryQ.error || !advisoryQ.data) {
    return <Alert variant="danger" title={t('common.error')}>{formatErrorMessage(advisoryQ.error)}</Alert>;
  }

  const advisory = advisoryQ.data;
  const state = String(advisory.state ?? 'draft');
  const canEditParent = canEditSecurityAdvisory(state);
  const canPostUpdate = canPostSecurityAdvisoryUpdate(state);

  const openUpdateCreate = () => {
    if (!canPostUpdate) return;
    setUpdateError(null);
    setUpdateEditorOpen(true);
  };

  return (
    <div className="space-y-4" data-testid="admin.security_advisory.detail">
      <SecurityAdvisoryDetailHeader
        advisory={advisory}
        cveLabels={cveLabels}
        state={state}
        activeTab={activeTab}
        updateCount={updatesQ.data?.length ?? 0}
        canEditParent={canEditParent}
        canPostUpdate={canPostUpdate}
        languagesReady={languagesReady}
        cvesReady={cvesReady}
        readinessDataReady={readinessDataReady}
        readinessIssues={readinessIssues}
        languagesError={languagesQ.error}
        readinessError={cvesQ.error ?? nodesQ.error ?? statusesQ.error}
        onEdit={() => {
          setEditorError(null);
          setEditorOpen(true);
        }}
        onRebuild={() => setRebuildOpen(true)}
        onPublish={openPublish}
        onPostUpdate={openUpdateCreate}
        onTabChange={(tab) => setSearchParams(tab === 'overview' ? {} : { tab })}
      />

      {activeTab === 'overview' ? (
        <SecurityAdvisoryOverviewPanel
          advisory={advisory}
          languages={languagesQ.data ?? []}
          readinessIssues={readinessIssues}
        />
      ) : null}

      {activeTab === 'nodes' ? (
        <SecurityAdvisoryNodesPanel
          advisoryId={advisoryId}
          nodes={nodesQ.data ?? []}
          statuses={statusesQ.data ?? []}
          loading={nodesQ.isLoading || statusesQ.isLoading}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['security_advisory_node_statuses', advisoryId] });
            void queryClient.invalidateQueries({ queryKey: ['security_advisory', advisoryId] });
          }}
        />
      ) : null}

      {activeTab === 'affected' ? (
        <SecurityAdvisoryAffectedPanel
          users={affectedUsersQ.data ?? []}
          vps={affectedVpsQ.data ?? []}
          usersLoading={affectedUsersQ.isLoading}
          vpsLoading={affectedVpsQ.isLoading}
          usersError={affectedUsersQ.error}
          vpsError={affectedVpsQ.error}
        />
      ) : null}

      {activeTab === 'updates' ? (
        <SecurityAdvisoryUpdatesPanel
          updates={updates}
          state={state}
          canPostUpdate={canPostUpdate}
          languagesReady={languagesReady}
          loading={updatesQ.isLoading}
          error={updatesQ.error}
          onCreate={openUpdateCreate}
        />
      ) : null}

      {activeTab === 'outages' ? (
        <SecurityAdvisoryOutagesPanel
          links={outagesQ.data ?? []}
          outageId={outageId}
          loading={outagesQ.isLoading}
          linking={linkOutageM.isPending}
          error={outagesQ.error}
          onOutageIdChange={setOutageId}
          onLink={() => linkOutageM.mutate()}
          onUnlink={setUnlinkTarget}
        />
      ) : null}

      <SecurityAdvisoryDetailDialogs
        advisory={advisory}
        advisoryId={advisoryId}
        state={state}
        canEditParent={canEditParent}
        canPostUpdate={canPostUpdate}
        languages={languagesQ.data ?? []}
        cves={cveLabels}
        editorOpen={editorOpen}
        editorError={editorError}
        editorSaving={editM.isPending}
        onEditorClose={() => !editM.isPending && setEditorOpen(false)}
        onEditorSubmit={(values, cves) => editM.mutate({ values, cves })}
        publishOpen={publishOpen}
        publishAt={publishAt}
        publishMail={publishMail}
        publishError={publishError}
        publishSaving={publishM.isPending}
        publishBlocked={readinessIssues.length > 0}
        onPublishClose={() => !publishM.isPending && setPublishOpen(false)}
        onPublishAtChange={setPublishAt}
        onPublishMailChange={setPublishMail}
        onPublishConfirm={() => publishM.mutate()}
        rebuildOpen={rebuildOpen}
        rebuildSaving={rebuildM.isPending}
        onRebuildClose={() => setRebuildOpen(false)}
        onRebuildConfirm={() => rebuildM.mutate()}
        updateEditorOpen={updateEditorOpen}
        updateError={updateError}
        updateSaving={createUpdateM.isPending}
        onUpdateEditorClose={() => {
          if (createUpdateM.isPending) return;
          setUpdateEditorOpen(false);
          setUpdateError(null);
        }}
        onUpdateSubmit={submitUpdate}
        updateConfirmOpen={updateConfirmOpen}
        pendingUpdate={pendingUpdate}
        onUpdateConfirmClose={() => {
          setUpdateConfirmOpen(false);
          setPendingUpdate(null);
        }}
        onUpdateConfirm={() => pendingUpdate && createUpdateM.mutate(pendingUpdate)}
        unlinkTarget={unlinkTarget}
        unlinkSaving={unlinkOutageM.isPending}
        onUnlinkClose={() => setUnlinkTarget(null)}
        onUnlinkConfirm={() => unlinkOutageM.mutate()}
      />
    </div>
  );
}
