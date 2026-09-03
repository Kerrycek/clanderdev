import React from 'react';
// i18n-ignore-file -- adversarial test fixtures intentionally use literal long labels.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ObjectHeader } from './ObjectHeader';

describe('ObjectHeader responsive containment', () => {
  it('lets long titles and action groups wrap within a mobile viewport', () => {
    render(
      <MemoryRouter>
        <ObjectHeader
          testId="header"
          title="an-uninterrupted-object-identifier-that-must-not-widen-the-document"
          titleAfter={<span>status badges</span>}
          actions={<><button>First long action</button><button>Second long action</button></>}
        />
      </MemoryRouter>
    );

    const header = screen.getByTestId('header');
    const heading = screen.getByRole('heading');
    const actionGroup = screen.getByRole('button', { name: 'First long action' }).parentElement;
    const responsiveRightColumn = actionGroup?.parentElement;

    expect(heading).toHaveClass('min-w-0', 'break-words', '[overflow-wrap:anywhere]');
    expect(actionGroup).toHaveClass('min-w-0', 'w-full', 'flex-wrap', 'sm:w-auto');
    expect(responsiveRightColumn).toHaveClass('min-w-0', 'w-full', 'sm:w-auto', 'sm:shrink-0');
  });
});
