import { describe, expect, test } from 'vitest';

import {
  mailTemplateEditorPayload,
  mailTemplateEditorUpdatePayload,
  type MailTemplateEditorValues,
} from './MailTemplateEditorModal';

const values: MailTemplateEditorValues = {
  name: '  registration  ',
  label: '  Registration mail  ',
  templateId: '  registration-v2  ',
  userVisibility: 'visible',
};

describe('mail template editor payloads', () => {
  test('create includes normalized operational identifiers', () => {
    expect(mailTemplateEditorPayload(values)).toEqual({
      name: 'registration',
      label: 'Registration mail',
      template_id: 'registration-v2',
      user_visibility: 'visible',
    });
  });

  test('edit cannot send operational identifiers', () => {
    expect(mailTemplateEditorUpdatePayload(values)).toEqual({
      label: 'Registration mail',
      user_visibility: 'visible',
    });
  });
});
