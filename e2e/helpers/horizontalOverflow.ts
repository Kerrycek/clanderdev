import { expect, type Page } from '@playwright/test';

export async function expectNoDocumentHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body?.scrollWidth ?? 0,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          testId: element.dataset.testid ?? null,
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((element) => element.left < -1 || element.right > document.documentElement.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 12),
  }));

  const widestDocument = Math.max(metrics.documentWidth, metrics.bodyWidth);
  expect(widestDocument, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(metrics.viewportWidth);
}

export async function expectTableHorizontalScrollUsable(page: Page, tableTestId: string) {
  const metrics = await page.getByTestId(tableTestId).evaluate((table) => {
    const scroller = table.parentElement as HTMLElement | null;
    if (!scroller) return null;

    const rect = scroller.getBoundingClientRect();
    const initialScrollLeft = scroller.scrollLeft;
    scroller.scrollLeft = 0;
    const startScrollLeft = scroller.scrollLeft;
    scroller.scrollLeft = scroller.scrollWidth;
    const endScrollLeft = scroller.scrollLeft;
    scroller.scrollLeft = initialScrollLeft;

    return {
      overflowX: getComputedStyle(scroller).overflowX,
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      startScrollLeft,
      endScrollLeft,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(metrics, `Table ${tableTestId} has no direct scroll container`).not.toBeNull();
  if (!metrics) throw new Error(`Table ${tableTestId} has no direct scroll container`);

  expect(metrics.overflowX).toMatch(/^(auto|scroll)$/);
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.endScrollLeft).toBeGreaterThan(metrics.startScrollLeft);
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}
