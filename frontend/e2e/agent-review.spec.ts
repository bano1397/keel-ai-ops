import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("agent logs in, opens a conversation, sees the trace and approves a reply", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  const list = page.getByTestId("conversation-list");
  await expect(list).toBeVisible();

  const pending = list.locator("button", { hasText: "to review" }).first();
  const target = (await pending.count()) > 0 ? pending : list.locator("button").first();
  const testId = await target.getAttribute("data-testid");
  const id = testId?.replace("conversation-", "");
  await page.goto(`/conversations/${id}`);

  await expect(page.getByTestId("message-assistant").first()).toBeVisible();
  const timeline = page.getByTestId("trace-timeline").first();
  if (!(await timeline.isVisible())) await page.getByTestId("toggle-trace").first().click();
  await expect(page.getByTestId("trace-timeline").first()).toBeVisible();
  await expect(page.getByTestId("confidence-bar").first()).toBeVisible();

  const approve = page.getByTestId("approve-reply").first();
  if ((await approve.count()) === 0) {
    await page.goto("/approvals");
  }
  await page.getByTestId("approve-reply").first().click();
  await expect(page.getByText(/approved and sent/i)).toBeVisible();
});
