import { describe, expect, it } from 'vitest';

import { requestReviewActions } from './RequestReviewActions';

describe('requestReviewActions', () => {
  it('keeps decided requests editable for admins', () => {
    expect(requestReviewActions('registration', { id: 1, state: 'approved' }, true)).toEqual([
      'deny',
      'ignore',
      'request_correction',
    ]);
    expect(requestReviewActions('registration', { id: 2, state: 'denied' }, true)).toEqual([
      'approve',
      'ignore',
      'request_correction',
    ]);
    expect(requestReviewActions('registration', { id: 3, state: 'ignored' }, true)).toEqual([
      'approve',
      'deny',
      'request_correction',
    ]);
  });

  it('does not strand change requests in a correction state applicants cannot resubmit', () => {
    expect(requestReviewActions('change', { id: 4, state: 'awaiting' }, true)).toEqual([
      'approve',
      'deny',
      'ignore',
    ]);
    expect(requestReviewActions('change', { id: 5, state: 'approved' }, true)).toEqual([
      'deny',
      'ignore',
    ]);
  });

  it('does not request the same correction state twice', () => {
    expect(requestReviewActions('registration', { id: 6, state: 'pending_correction' }, true)).toEqual([
      'approve',
      'deny',
      'ignore',
    ]);
  });

  it('does not expose review actions outside admin mode', () => {
    expect(requestReviewActions('registration', { id: 7, state: 'denied' }, false)).toEqual([]);
  });
});
