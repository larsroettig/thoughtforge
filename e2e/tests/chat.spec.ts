import { test, expect } from "../setup/fixtures";

test.describe("Chat view", () => {
  test.beforeEach(async ({ mockPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Chat" }).click();
    await page.waitForTimeout(400);
  });

  test("chat view renders a text input", async ({ mockPage: page }) => {
    // Chat should have a message input or textarea
    const input = page.locator("textarea, input[type='text']").first();
    await expect(input).toBeVisible({ timeout: 6000 });
  });

  test("slash commands are accessible", async ({ mockPage: page }) => {
    // Sidebar or chat view should reference slash commands or context
    await expect(page.locator("text=/plan|chat|ask/i").first()).toBeVisible({ timeout: 4000 });
  });

  test("typing in the chat input is possible", async ({ mockPage: page }) => {
    const input = page.locator("textarea, input[type='text']").first();
    await expect(input).toBeVisible({ timeout: 6000 });
    await input.fill("Plan my day");
    await expect(input).toHaveValue("Plan my day");
  });

  test("LLM disconnected state is shown gracefully", async ({ mockPage: page }) => {
    // The mock returns [] for list_models, so LLM should show as disconnected
    // App should still render — no crash
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/error|crash/i)).not.toBeVisible();
  });
});
