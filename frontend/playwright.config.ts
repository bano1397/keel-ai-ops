import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npm run dev -- -p " + new URL(baseURL).port,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: { NEXT_PUBLIC_API_URL: process.env.E2E_API_URL ?? "http://localhost:8000", NEXT_PUBLIC_MOCK: process.env.NEXT_PUBLIC_MOCK ?? "0" },
      },
});
