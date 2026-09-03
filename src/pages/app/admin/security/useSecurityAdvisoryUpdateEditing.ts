import { useState, type Dispatch, type SetStateAction } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import {
  deleteSecurityAdvisoryUpdate,
  updateSecurityAdvisoryUpdate,
  type SecurityAdvisoryUpdate,
} from '../../../../lib/api/securityAdvisories';
import { formatErrorMessage } from '../../../../lib/errors';
import {
  securityAdvisoryUpdateTextPayload,
  type SecurityAdvisoryUpdateValues,
} from './SecurityAdvisoryUpdateModal';

export function useSecurityAdvisoryUpdateEditing(options: {
  invalidateDetail: () => Promise<unknown>;
  setUpdateError: Dispatch<SetStateAction<string | null>>;
}) {
  const { t } = useI18n();
  const { pushToast } = useToasts();
  const [editingUpdate, setEditingUpdate] = useState<SecurityAdvisoryUpdate | null>(null);
  const [deleteUpdateTarget, setDeleteUpdateTarget] = useState<SecurityAdvisoryUpdate | null>(null);

  const editUpdateM = useMutation({
    mutationFn: (values: SecurityAdvisoryUpdateValues) => {
      if (!editingUpdate) throw new Error('Missing advisory update');
      return updateSecurityAdvisoryUpdate(editingUpdate.id, securityAdvisoryUpdateTextPayload(values));
    },
    onSuccess: async () => {
      setEditingUpdate(null);
      options.setUpdateError(null);
      await options.invalidateDetail();
      pushToast({ variant: 'ok', title: t('admin.security_advisories.toast.update_saved') });
    },
    onError: (error) => {
      const message = formatErrorMessage(error);
      options.setUpdateError(message);
      pushToast({ variant: 'danger', title: t('admin.security_advisories.toast.update_failed'), body: message });
    },
  });

  const deleteUpdateM = useMutation({
    mutationFn: () => {
      if (!deleteUpdateTarget) throw new Error('Missing advisory update');
      return deleteSecurityAdvisoryUpdate(deleteUpdateTarget.id);
    },
    onSuccess: async () => {
      setDeleteUpdateTarget(null);
      await options.invalidateDetail();
      pushToast({ variant: 'ok', title: t('admin.security_advisories.toast.update_deleted') });
    },
    onError: (error) => pushToast({ variant: 'danger', title: t('common.error'), body: formatErrorMessage(error) }),
  });

  return {
    editingUpdate,
    setEditingUpdate,
    deleteUpdateTarget,
    setDeleteUpdateTarget,
    editUpdateM,
    deleteUpdateM,
  };
}
