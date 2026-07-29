import { safeContentUrl } from './safeUrl';

const DEFAULT_DROP_WITH_CONTENT_TAGS = new Set([
  'iframe',
  'object',
  'script',
  'style',
  'template',
]);

const UNSAFE_ATTRIBUTE_NAME = /^(?:on|style$|srcdoc$|xmlns(?::|$)|xlink:href$)/i;
const SAFE_ATTRIBUTE_NAME = /^[a-z][a-z0-9_.:-]*$/;
const URL_ATTRIBUTE_NAMES = new Set(['href', 'src']);

export type HtmlSanitizerAttributeContext = {
  tagName: string;
  sourceAttributes: ReadonlyMap<string, string>;
};

export type HtmlSanitizerPolicy = {
  allowedTags: ReadonlySet<string>;
  dropWithContentTags?: ReadonlySet<string>;
  sanitizeAttributes?: (
    context: HtmlSanitizerAttributeContext,
  ) => Readonly<Record<string, string | null | undefined>>;
  allowMailtoAttributes?: ReadonlySet<string>;
  hardenLinks?: boolean;
  afterSanitize?: (fragment: DocumentFragment) => void;
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;

  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }

  parent.removeChild(el);
}

function sourceAttributes(el: Element): ReadonlyMap<string, string> {
  return new Map(Array.from(el.attributes, (attribute) => [attribute.name.toLowerCase(), attribute.value]));
}

function sanitizedAttributeValue(
  tagName: string,
  attributeName: string,
  rawValue: string,
  policy: HtmlSanitizerPolicy,
): string | null {
  if (!SAFE_ATTRIBUTE_NAME.test(attributeName) || UNSAFE_ATTRIBUTE_NAME.test(attributeName)) return null;

  if (!URL_ATTRIBUTE_NAMES.has(attributeName)) return rawValue;

  return safeContentUrl(rawValue, {
    allowMailto: policy.allowMailtoAttributes?.has(`${tagName}.${attributeName}`),
  });
}

function sanitizeElement(el: Element, policy: HtmlSanitizerPolicy): void {
  const tagName = el.tagName.toLowerCase();
  const dropWithContentTags = policy.dropWithContentTags ?? DEFAULT_DROP_WITH_CONTENT_TAGS;

  if (dropWithContentTags.has(tagName)) {
    el.remove();
    return;
  }

  if (!policy.allowedTags.has(tagName)) {
    unwrapElement(el);
    return;
  }

  const originalAttributes = sourceAttributes(el);
  for (const attribute of Array.from(el.attributes)) {
    el.removeAttribute(attribute.name);
  }

  const attributes = policy.sanitizeAttributes?.({
    tagName,
    sourceAttributes: originalAttributes,
  });

  if (attributes) {
    for (const [rawName, rawValue] of Object.entries(attributes)) {
      if (rawValue === null || rawValue === undefined) continue;

      const name = rawName.toLowerCase();
      const value = sanitizedAttributeValue(tagName, name, rawValue, policy);
      if (value !== null) el.setAttribute(name, value);
    }
  }

  if (policy.hardenLinks && tagName === 'a' && el.hasAttribute('href')) {
    el.setAttribute('rel', 'noopener noreferrer');
    if (originalAttributes.get('target') === '_blank') {
      el.setAttribute('target', '_blank');
    }
  }
}

function removeComments(fragment: DocumentFragment): void {
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];

  while (walker.nextNode()) {
    comments.push(walker.currentNode as Comment);
  }

  for (const comment of comments) comment.remove();
}

export function sanitizeHtml(rawHtml: string, policy: HtmlSanitizerPolicy): string {
  const raw = String(rawHtml ?? '');
  if (!raw.trim()) return '';

  if (typeof document === 'undefined') return escapeHtml(raw);

  const template = document.createElement('template');
  template.innerHTML = raw;

  for (const node of Array.from(template.content.querySelectorAll('*'))) {
    sanitizeElement(node, policy);
  }

  removeComments(template.content);
  policy.afterSanitize?.(template.content);

  return template.innerHTML;
}

const NEWS_ALLOWED_TAGS = new Set([
  'a',
  'b',
  'br',
  'code',
  'em',
  'i',
  'li',
  'ol',
  'p',
  'small',
  'span',
  'strong',
  'ul',
]);

const NEWS_SANITIZER_POLICY: HtmlSanitizerPolicy = {
  allowedTags: NEWS_ALLOWED_TAGS,
  allowMailtoAttributes: new Set(['a.href']),
  hardenLinks: true,
  sanitizeAttributes: ({ tagName, sourceAttributes: attributes }) =>
    tagName === 'a' ? { href: attributes.get('href') } : {},
};

export function sanitizeNewsHtml(rawHtml: string): string {
  return sanitizeHtml(rawHtml, NEWS_SANITIZER_POLICY);
}
