import { test, expect } from "../setup/fixtures";

test.describe("Kanban board", () => {
  test.beforeEach(async ({ mockPage: page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Board" }).click();
    // Wait for the board to render
    await page.waitForTimeout(300);
  });

  test("renders kanban columns", async ({ mockPage: page }) => {
    // Board columns should be present (To Do, In Progress, Review, Done)
    await expect(page.getByText(/To Do/i).first()).toBeVisible({ timeout: 6000 });
    await expect(page.getByText(/In Progress/i).first()).toBeVisible();
  });

  test("mock tasks appear in columns", async ({ mockPage: page }) => {
    // task_002 (in_progress) and task_001 (blocked → visible) should be on board
    await expect(page.getByText("Submit ICLR 2026 camera-ready paper")).toBeVisible({ timeout: 6000 });
  });

  test("shows done column with completed tasks", async ({ mockPage: page }) => {
    await expect(page.getByText("Train baseline model on WikiText-103")).toBeVisible({ timeout: 6000 });
  });

  test("navigating away and back preserves state", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "Dashboard" }).click();
    await page.getByRole("button", { name: "Board" }).click();
    await expect(page.getByText("Submit ICLR 2026 camera-ready paper")).toBeVisible({ timeout: 6000 });
  });
});
