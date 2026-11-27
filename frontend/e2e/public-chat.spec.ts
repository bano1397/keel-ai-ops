import { expect, test } from "@playwright/test";

test("public chat streams a reply with sources", async ({ page }) => {
  await page.goto("/chat");
  await page.getByLabel("Email").fill(process.env.E2E_CHAT_EMAIL ?? "amelia.hughes@example.co.uk");
  await page.getByRole("button", { name: "Start chatting" }).click();
  await page.getByLabel("Message").fill("How much is standard delivery?");
  await page.getByRole("button", { name: "Send" }).click();

  const turn = page.getByTestId("assistant-turn").last();
  await expect(turn).toBeVisible();
  await expect.poll(async () => (await turn.innerText()).trim().length, { timeout: 45_000 }).toBeGreaterThan(20);
  await expect(page.getByTestId("how-i-answered")).toBeVisible({ timeout: 45_000 });
});
