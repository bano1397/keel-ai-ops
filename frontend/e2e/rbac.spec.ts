import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("agent cannot see or open /ops", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId("nav-inbox")).toBeVisible();
  await expect(page.getByTestId("nav-ops")).toHaveCount(0);
  await expect(page.getByTestId("nav-settings")).toHaveCount(0);
  await page.goto("/ops");
  await expect(page.getByTestId("admin-required")).toBeVisible();
  await expect(page.getByRole("button", { name: /send daily report/i })).toHaveCount(0);
});
