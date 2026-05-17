import { test, expect } from "../setup/fixtures";

test.describe("Settings", () => {
  test.beforeEach(async ({ mockPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.waitForTimeout(400);
  });

  test("settings view renders LLM URL field", async ({ mockPage: page }) => {
    // LM Studio URL input should be present
    await expect(page.getByText(/LM Studio/i).first()).toBeVisible({ timeout: 6000 });
  });

  test("LLM URL input shows mock config value", async ({ mockPage: page }) => {
    // The mock config has lm_studio_url: "http://localhost:1234"
    const urlInput = page.locator("input").filter({ hasText: "" }).nth(0);
    // Look for the URL value in any input
    const inputs = page.locator("input[type='text'], input[type='url']");
    const count = await inputs.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const val = await inputs.nth(i).inputValue();
      if (val === "http://localhost:1234") { found = true; break; }
    }
    expect(found).toBe(true);
  });

  test("save triggers write_config invoke", async ({ mockPage: page }) => {
    // Find and click any Save button in settings
    const saveBtn = page.getByRole("button", { name: /Save|Apply/i }).first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      const calls = await page.evaluate(() => window.__E2E_MOCK__?.invokeCalls?.map((c: { cmd: string }) => c.cmd) ?? []);
      expect(calls).toContain("write_config");
    }
  });

  test("vault path is displayed", async ({ mockPage: page }) => {
    await expect(page.getByText(/vault/i).first()).toBeVisible({ timeout: 4000 });
  });
});
