import { test, expect } from "../setup/fixtures";

test.describe("Task modal", () => {
  test.beforeEach(async ({ mockPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Board" }).click();
    await page.waitForTimeout(300);
  });

  test("opens on task click and shows title", async ({ mockPage: page }) => {
    await page.getByText("Submit ICLR 2026 camera-ready paper").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });
    await expect(page.getByRole("dialog").getByText("Edit Task")).toBeVisible();
  });

  test("has correct aria attributes", async ({ mockPage: page }) => {
    await page.getByText("Submit ICLR 2026 camera-ready paper").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelId = await dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    await expect(page.locator(`#${labelId}`)).toBeVisible();
  });

  test("Escape key closes the modal", async ({ mockPage: page }) => {
    await page.getByText("Submit ICLR 2026 camera-ready paper").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  test("Cancel button closes the modal", async ({ mockPage: page }) => {
    await page.getByText("Submit ICLR 2026 camera-ready paper").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 2000 });
  });

  test("form labels are associated with inputs", async ({ mockPage: page }) => {
    await page.getByText("Submit ICLR 2026 camera-ready paper").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });

    // Title input should be reachable via label
    const titleInput = page.getByLabel(/Title/i);
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue("Submit ICLR 2026 camera-ready paper");
  });

  test("Save calls write_task invoke", async ({ mockPage: page }) => {
    await page.getByText("Submit ICLR 2026 camera-ready paper").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 4000 });

    // Clear and type a new title
    const titleInput = page.getByLabel(/Title/i);
    await titleInput.fill("Updated paper title");

    await page.getByRole("dialog").getByRole("button", { name: /Save/i }).click();

    const calls = await page.evaluate(() => window.__E2E_MOCK__?.invokeCalls?.map((c: { cmd: string }) => c.cmd) ?? []);
    expect(calls).toContain("write_task");
  });
});
