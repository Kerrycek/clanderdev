// i18n-ignore-file
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { KeysetPagination } from './KeysetPagination';

vi.mock('../../app/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('KeysetPagination', () => {
  it('offers direct page navigation, a jump field and a row limit', () => {
    const onGoToPage = vi.fn();
    const onLimitChange = vi.fn();

    render(
      <KeysetPagination
        page={5}
        pageCount={12}
        totalPagesKnown
        canPrev
        canNext
        onPrev={() => undefined}
        onNext={() => undefined}
        onGoToPage={onGoToPage}
        limit={50}
        allowedLimits={[25, 50, 100]}
        onLimitChange={onLimitChange}
        testId="pager"
      />
    );

    fireEvent.click(screen.getByTestId('pager.page.12'));
    expect(onGoToPage).toHaveBeenCalledWith(12);

    fireEvent.change(screen.getByTestId('pager.jump'), { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('pager.jump.submit'));
    expect(onGoToPage).toHaveBeenCalledWith(8);

    fireEvent.change(screen.getByTestId('pager.limit'), { target: { value: '100' } });
    expect(onLimitChange).toHaveBeenCalledWith(100);
  });
});
