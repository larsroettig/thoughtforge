import { test, expect } from "../setup/fixtures";

test.describe("App bootstrap", () => {
  test("sidebar renders nav items and project spaces", async ({ mockPage: page }) => {
    await page.goto("/");

    // Sidebar nav items should be visible
    await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  });

  test("mock spaces appear in sidebar", async ({ mockPage: page }) => {
    await page.goto("/");

    // Wait for bootstrap to complete — spaces section visible
    await expect(page.getByRole("button", { name: /Expand spaces|Collapse spaces/ })).toBeVisible();

    // General space should always exist
    await expect(page.getByText("General")).toBeVisible();
  });

  test("default view is dashboard", async ({ mockPage: page }) => {
    await page.goto("/");
    // Dashboard renders a heading or content area
    await expect(page.locator("h2, h1, [class*='dashboard']").first()).toBeVisible({ timeout: 8000 });
  });

  test("vault is initialized before rendering content", async ({ mockPage: page }) => {
    await page.goto("/");

    // init_vault should have been called
    const calls = await page.evaluate(() => window.__E2E_MOCK__?.invokeCalls?.map((c: { cmd: string }) => c.cmd) ?? []);
    expect(calls).toContain("init_vault");
    expect(calls).toContain("read_config");
    expect(calls).toContain("read_tasks");
    expect(calls).toContain("read_spaces");
  });
});
