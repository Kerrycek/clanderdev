import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAppMode } from '../../../../app/appMode';
import { useI18n } from '../../../../app/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { reconcileNodeCreateAfterSettling } from '../../../../lib/api/nodeCreateReconciliation';

export interface IndeterminateNodeCreateAttempt {
  name: string;
  ipAddress: string;
}

interface NodeCreateIndeterminateGuardProps {
  attempt: IndeterminateNodeCreateAttempt;
  onListRefresh: () => void | Promise<unknown>;
}

export function NodeCreateIndeterminateGuard({
  attempt,
  onListRefresh,
}: NodeCreateIndeterminateGuardProps) {
  const { basePath } = useAppMode();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [verifying, setVerifying] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [verificationUnresolved, setVerificationUnresolved] = useState(false);
  const [foundNodeId, setFoundNodeId] = useState<number>();

  const verify = async () => {
    if (verifying) return;
    setVerifying(true);
    setVerificationFailed(false);
    setVerificationUnresolved(false);
    try {
      const result = await reconcileNodeCreateAfterSettling({
        name: attempt.name,
        ip_addr: attempt.ipAddress,
      });
      await onListRefresh();
      if (result.status === 'found') {
        setFoundNodeId(result.node.id);
      } else {
        setVerificationUnresolved(true);
      }
    } catch {
      setVerificationFailed(true);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Alert
      variant="danger"
      title={t('admin.node.editor.create.indeterminate_title')}
      className="mb-4"
      testId="admin.nodes.create.indeterminate"
    >
      <div className="space-y-3">
        <p>{t('admin.node.editor.create.indeterminate_body')}</p>
        <p className="font-medium" data-testid="admin.nodes.create.indeterminate.fingerprint">
          {t('admin.node.editor.create.indeterminate_attempt', {
            name: attempt.name,
            ip: attempt.ipAddress,
          })}
        </p>
        {verificationFailed ? (
          <p data-testid="admin.nodes.create.verify_error">
            {t('admin.node.editor.create.indeterminate_verify_failed')}
          </p>
        ) : null}
        {verificationUnresolved ? (
          <p data-testid="admin.nodes.create.unresolved">
            {t('admin.node.editor.create.indeterminate_unresolved')}
          </p>
        ) : null}
        {foundNodeId ? (
          <div className="space-y-2" data-testid="admin.nodes.create.found">
            <p>{t('admin.node.editor.create.indeterminate_found')}</p>
            <Button
              variant="secondary"
              onClick={() => navigate(`${basePath}/nodes/${foundNodeId}`)}
              testId="admin.nodes.create.open_found"
            >
              {t('admin.node.editor.create.indeterminate_open')}
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void verify()}
            loading={verifying}
            testId="admin.nodes.create.verify"
          >
            {t('admin.node.editor.create.indeterminate_verify')}
          </Button>
        )}
      </div>
    </Alert>
  );
}
