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

  it('keeps remote cursor jumps bounded and disables duplicate navigation while pending', () => {
    const onGoToPage = vi.fn();

    render(
      <KeysetPagination
        page={1}
        pageCount={50}
        totalPagesKnown
        maxDirectPage={9}
        jumpPending
        canPrev={false}
        canNext
        onPrev={() => undefined}
        onNext={() => undefined}
        onGoToPage={onGoToPage}
        testId="bounded-pager"
      />
    );

    expect(screen.getByTestId('bounded-pager.page.50')).toBeDisabled();
    expect(screen.getByTestId('bounded-pager.next')).toBeDisabled();
    expect(screen.getByTestId('bounded-pager.jump')).toHaveAttribute('max', '9');
    expect(screen.getByTestId('bounded-pager.progressive-hint')).toHaveTextContent(
      'pagination.progressive_hint'
    );

    fireEvent.change(screen.getByTestId('bounded-pager.jump'), { target: { value: '50' } });
    fireEvent.submit(screen.getByTestId('bounded-pager.jump').closest('form')!);
    expect(onGoToPage).not.toHaveBeenCalled();
  });
});
