import { describe, expect, it } from 'vitest';

import { resolveOptionId } from './oomReportsListSemantics';

const options = [
  { id: 21, label: 'Production Prague' },
  { id: 22, label: 'Production Brno' },
  { id: 23, label: 'Playground' },
];

describe('resolveOptionId', () => {
  const label = (option: (typeof options)[number]) => option.label;

  it('prefers an exact numeric id and resolves a unique label fragment', () => {
    expect(resolveOptionId(options, '22', label)).toEqual({ id: 22 });
    expect(resolveOptionId(options, 'prague', label)).toEqual({ id: 21 });
  });

  it('rejects ambiguous and unknown labels instead of silently choosing one', () => {
    expect(resolveOptionId(options, 'production', label)).toEqual({ err: 'ambiguous' });
    expect(resolveOptionId(options, 'staging', label)).toEqual({ err: 'none' });
  });
});
