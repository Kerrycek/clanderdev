// i18n-ignore-file
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { SecurityAdvisoriesCard } from './DashboardSecurityAdvisoriesCard';

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, preferredLanguageCodes: ['en'] }),
}));

describe('SecurityAdvisoriesCard', () => {
  it('links the list and rows to native advisory routes', () => {
    render(
      <MemoryRouter>
        <SecurityAdvisoriesCard
          isLoading={false}
          isError={false}
          advisories={[{ id: 5, name: 'Native advisory', state: 'published' }]}
          listPath="/admin/security-advisories"
          detailBasePath="/admin/security-advisories"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'dashboard.section.security.open' })).toHaveAttribute('href', '/admin/security-advisories');
    expect(screen.getByRole('link', { name: 'Native advisory' })).toHaveAttribute('href', '/admin/security-advisories/5');
  });
});
