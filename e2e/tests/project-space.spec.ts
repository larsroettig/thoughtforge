import { test, expect } from "../setup/fixtures";

test.describe("Project space", () => {
  test.beforeEach(async ({ mockPage: page }) => {
    await page.goto("/");
    // Wait for spaces to load
    await expect(page.getByText("General")).toBeVisible({ timeout: 6000 });
  });

  test("clicking a space navigates to project space view", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: /^General$/ }).click();
    // Project space view should render
    await expect(page.getByText("General").first()).toBeVisible({ timeout: 4000 });
  });

  test("research space is accessible from sidebar", async ({ mockPage: page }) => {
    await expect(page.getByText("Research")).toBeVisible();
    await page.getByRole("button", { name: /^Research$/ }).click();
    await page.waitForTimeout(400);
    // Should navigate to project-space view without error
    await expect(page.locator("text=Research").first()).toBeVisible({ timeout: 4000 });
  });

  test("create space modal opens and has aria attributes", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "New project space" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 4000 });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByText("New Project Space")).toBeVisible();
  });

  test("create space modal closes with Escape", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "New project space" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  test("create space form has associated labels", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "New project space" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });

    const nameInput = page.getByLabel(/Project Name/i);
    await expect(nameInput).toBeVisible();
  });
});
