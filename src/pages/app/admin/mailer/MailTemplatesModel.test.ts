import { describe, expect, it } from 'vitest';

import {
  filterMailTemplates,
  normalizeMailTemplateListParam,
  parseMailTemplatePage,
  parseMailTemplatePageLimit,
} from './MailTemplatesModel';

const templates = [
  { id: 1, name: 'welcome', label: 'Welcome mail', template_id: 'account.welcome', user_visibility: 'visible' },
  { id: 42, name: 'invoice', label: 'Monthly invoice', template_id: 'payment.invoice', user_visibility: 'default' },
];

describe('MailTemplatesModel', () => {
  it('searches id, name, label and template_id locally', () => {
    for (const q of ['42', '#42', 'INVOICE', 'monthly', 'payment.invoice']) {
      expect(filterMailTemplates(templates, { q, templateId: '', userVisibility: '' })).toEqual([templates[1]]);
    }
  });

  it('preserves query draft whitespace and trims only exact URL filters', () => {
    expect(normalizeMailTemplateListParam('q', 'Welcome ')).toBe('Welcome ');
    expect(normalizeMailTemplateListParam('template_id', ' account.welcome ')).toBe('account.welcome');
    expect(normalizeMailTemplateListParam('page', ' 2 ')).toBe('2');

    expect(filterMailTemplates(templates, {
      q: '  Welcome mail  ',
      templateId: '',
      userVisibility: '',
    })).toEqual([templates[0]]);
  });

  it('applies exact template_id and user_visibility filters', () => {
    expect(filterMailTemplates(templates, {
      q: '',
      templateId: 'account.welcome',
      userVisibility: 'visible',
    })).toEqual([templates[0]]);

    expect(filterMailTemplates(templates, {
      q: '',
      templateId: 'welcome',
      userVisibility: 'visible',
    })).toEqual([]);
  });

  it('normalizes known client-side page sizes and clamps the requested page', () => {
    expect(parseMailTemplatePageLimit('25')).toBe(25);
    expect(parseMailTemplatePageLimit('999')).toBe(50);
    expect(parseMailTemplatePage('4', 3)).toBe(3);
    expect(parseMailTemplatePage('invalid', 3)).toBe(1);
  });
});
