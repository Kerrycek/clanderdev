// i18n-ignore-file
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SecurityAdvisoryUpdatesPanel } from './SecurityAdvisoryUpdatesPanel';

vi.mock('../../../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, preferredLanguageCodes: ['en'] }),
}));

describe('SecurityAdvisoryUpdatesPanel', () => {
  it('exposes edit and destructive delete actions for existing updates', () => {
    const update = { id: 12, state: 'retracted', en_summary: 'Withdrawn update', created_at: '2026-08-01T10:00:00Z' };
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <SecurityAdvisoryUpdatesPanel
        updates={[update]}
        state="retracted"
        canPostUpdate={false}
        languagesReady
        loading={false}
        onCreate={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTestId('admin.security_advisory.update.12.edit'));
    fireEvent.click(screen.getByTestId('admin.security_advisory.update.12.delete'));
    expect(onEdit).toHaveBeenCalledWith(update);
    expect(onDelete).toHaveBeenCalledWith(update);
  });
});
