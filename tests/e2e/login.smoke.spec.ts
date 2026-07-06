import { expect, test } from "@playwright/test";

test("login screen renders the login form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log in" }),
  ).toBeVisible();
});
