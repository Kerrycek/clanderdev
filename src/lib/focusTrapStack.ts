/**
 * A tiny focus-trap stack used by Modal/Drawer.
 *
 * Goals:
 * - Trap focus for the top-most open dialog.
 * - Support nested dialogs (e.g., Modal opened from inside Drawer).
 * - Keep the implementation dependency-free.
 */

export type FocusTrap = {
  id: string;
  container: HTMLElement;
};

const trapStack: FocusTrap[] = [];

function isHTMLElement(v: unknown): v is HTMLElement {
  return typeof v === 'object' && v !== null && (v as any).nodeType === 1;
}

function isVisible(el: HTMLElement): boolean {
  // In browsers, getClientRects() is a pragmatic visibility check.
  // It also filters out display:none elements.
  const rects = el.getClientRects();
  if (!rects || rects.length === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const nodes = Array.from(container.querySelectorAll(selector));
  const out: HTMLElement[] = [];

  for (const n of nodes) {
    if (!isHTMLElement(n)) continue;
    if (n.getAttribute('aria-hidden') === 'true') continue;
    // tabIndex < 0 is not focusable via Tab.
    if (n.tabIndex < 0) continue;
    if (!isVisible(n)) continue;
    out.push(n);
  }

  return out;
}

function safeFocus(el: HTMLElement) {
  try {
    // preventScroll is supported by all modern browsers.
    (el as any).focus?.({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      // ignore
    }
  }
}

function activeTrap(): FocusTrap | null {
  return trapStack.length > 0 ? trapStack[trapStack.length - 1] ?? null : null;
}

function focusFirst(container: HTMLElement) {
  const focusables = getFocusableElements(container);
  const first = focusables[0];
  if (first) {
    safeFocus(first);
    return;
  }
  // Fallback to the container itself.
  safeFocus(container);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;

  const trap = activeTrap();
  if (!trap) return;

  const container = trap.container;
  const focusables = getFocusableElements(container);

  // If there are no focusables, keep focus on the container.
  if (focusables.length === 0) {
    e.preventDefault();
    focusFirst(container);
    return;
  }

  const current = document.activeElement;
  const inside = isHTMLElement(current) && container.contains(current);

  // If focus escaped, bring it back in.
  if (!inside) {
    e.preventDefault();
    focusFirst(container);
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;

  if (e.shiftKey) {
    if (current === first) {
      e.preventDefault();
      safeFocus(last);
    }
    return;
  }

  if (current === last) {
    e.preventDefault();
    safeFocus(first);
  }
}

function onFocusIn(e: FocusEvent) {
  const trap = activeTrap();
  if (!trap) return;
  const container = trap.container;

  const target = e.target;
  if (!isHTMLElement(target)) return;
  if (container.contains(target)) return;

  // Redirect focus back to the first focusable element.
  focusFirst(container);
}

let listenersAttached = false;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  // Capture phase so we can intercept Tab before the browser moves focus.
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn, true);
}

function detachListeners() {
  if (!listenersAttached) return;
  listenersAttached = false;
  document.removeEventListener('keydown', onKeyDown, true);
  document.removeEventListener('focusin', onFocusIn, true);
}

export function registerFocusTrap(trap: FocusTrap) {
  trapStack.push(trap);
  attachListeners();

  return () => {
    const idx = trapStack.findIndex((t) => t.id === trap.id);
    if (idx >= 0) trapStack.splice(idx, 1);
    if (trapStack.length === 0) detachListeners();
  };
}

/**
 * Focuses the most appropriate element inside the currently active trap.
 * Useful right after a dialog mounts.
 */
export function focusActiveTrap() {
  const trap = activeTrap();
  if (!trap) return;
  focusFirst(trap.container);
}
