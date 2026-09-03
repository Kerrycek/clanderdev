import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearMailTemplateCreateGuard,
  clearMailTemplateTranslationCreateGuard,
  persistMailTemplateCreateGuard,
  persistMailTemplateTranslationCreateGuard,
  readMailTemplateCreateGuard,
  readMailTemplateTranslationCreateGuard,
} from './mailTemplateCreateGuardStorage';

describe('mail template create guards', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('round-trips and clears a template create fingerprint', () => {
    const attempt = {
      name: 'welcome',
      label: 'Welcome',
      template_id: 'welcome-v2',
      user_visibility: 'visible',
    };
    expect(persistMailTemplateCreateGuard(1, attempt)).toBe(true);
    expect(readMailTemplateCreateGuard(1)).toEqual(attempt);
    expect(readMailTemplateCreateGuard(2)).toBeNull();
    clearMailTemplateCreateGuard(1);
    expect(readMailTemplateCreateGuard(1)).toBeNull();
  });

  it('isolates translation guards by template and preserves nullable fields', () => {
    const attempt = {
      language: 2,
      languageLabel: 'Čeština',
      from: 'mailer@example.test',
      reply_to: null,
      return_path: null,
      subject: 'Vítej',
      text_plain: 'Ahoj',
      text_html: undefined,
    };
    expect(persistMailTemplateTranslationCreateGuard(1, 7, attempt)).toBe(true);
    expect(readMailTemplateTranslationCreateGuard(1, 7)).toEqual({
      language: 2,
      languageLabel: 'Čeština',
      from: 'mailer@example.test',
      reply_to: null,
      return_path: null,
      subject: 'Vítej',
      text_plain: 'Ahoj',
    });
    expect(readMailTemplateTranslationCreateGuard(1, 8)).toBeNull();
    expect(readMailTemplateTranslationCreateGuard(2, 7)).toBeNull();
    clearMailTemplateTranslationCreateGuard(1, 7);
    expect(readMailTemplateTranslationCreateGuard(1, 7)).toBeNull();
  });

  it('rejects malformed persisted ids, field lengths and visibility values', () => {
    window.sessionStorage.setItem('webui-next.mailer.mail-template-create.v2.1', JSON.stringify({
      name: 'bad', label: 'Bad', template_id: 'bad', user_visibility: 'root',
    }));
    window.sessionStorage.setItem('webui-next.mailer.mail-template-translation-create.v2.1.7', JSON.stringify({
      language: true, languageLabel: 'English', from: 'from', subject: 'subject',
    }));
    expect(readMailTemplateCreateGuard(1)).toBeNull();
    expect(readMailTemplateTranslationCreateGuard(1, 7)).toBeNull();
  });
});
