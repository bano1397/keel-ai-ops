import { expect, type Page } from "@playwright/test";

export const AGENT = {
  email: process.env.E2E_AGENT_EMAIL ?? "agent@keel.demo",
  password: process.env.E2E_AGENT_PASSWORD ?? "KeelAgent!2026",
};

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:8000";

export async function login(page: Page, creds = AGENT) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.getByTestId("user-role")).toHaveText(/agent|admin/i);
}
