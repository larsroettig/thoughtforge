import { test as base, Page } from "@playwright/test";
import { buildTauriMockScript } from "./tauri-mock";

/**
 * Extended test object that injects the Tauri mock before every page load.
 * Use this instead of Playwright's built-in `test` in all E2E specs.
 */
export const test = base.extend<{ mockPage: Page }>({
  mockPage: async ({ page }, use) => {
    await page.addInitScript(buildTauriMockScript());
    await use(page);
  },
});

export { expect } from "@playwright/test";
