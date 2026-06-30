import { renderToString } from "react-dom/server";
import { err, ok } from "neverthrow";
import { describe, expect, it } from "vitest";

import {
  ForgotPasswordView,
  handleForgotPasswordAction,
} from "./forgot-password";
import { LoginView } from "./login";
import { ResendVerificationView } from "./resend-verification";
import {
  handleResetPasswordAction,
  handleResetPasswordLoader,
  ResetPasswordView,
} from "./reset-password";
import { SignupView } from "./signup";
import { VerifyEmailView } from "./verify-email";

describe("auth screens", () => {
  it("renders login primary action, signup link, and resend access", () => {
    const html = renderToString(<LoginView />);

    expect(html).toContain("Log in");
    expect(html).toContain('href="/signup"');
    expect(html).toContain("Create an account");
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain("Forgot password?");
    expect(html).toContain('href="/resend-verification"');
    expect(html).toContain("Resend verification email");
  });

  it("renders signup primary action and login cross-link", () => {
    const html = renderToString(<SignupView />);

    expect(html).toContain("Create account");
    expect(html).toContain('href="/login"');
    expect(html).toContain("Log in to an existing account");
  });

  it("renders the resend verification screen primary action", () => {
    const html = renderToString(<ResendVerificationView />);

    expect(html).toContain("Resend verification email");
    expect(html).toContain("Send verification email");
    expect(html).toContain("unverified account");
    expect(html).toContain('href="/login"');
  });

  it("renders the successful verification state on login", () => {
    const html = renderToString(<LoginView verified />);

    expect(html).toContain("Email verified. You can now log in.");
  });

  it("renders the successful password reset state on login", () => {
    const html = renderToString(<LoginView passwordReset />);

    expect(html).toContain("Password reset. You can now log in.");
  });

  it("renders distinct invalid and expired verification states", () => {
    const invalid = renderToString(<VerifyEmailView status="invalid-token" />);
    const expired = renderToString(<VerifyEmailView status="expired-token" />);

    expect(invalid).toContain("verification link is invalid");
    expect(expired).toContain("verification link has expired");
    expect(invalid).toContain('href="/resend-verification"');
    expect(expired).toContain('href="/resend-verification"');
  });

  it("renders forgot password without revealing account registration", () => {
    const html = renderToString(
      <ForgotPasswordView actionData={{ status: "reset-requested" }} />,
    );

    expect(html).toContain("Send reset instructions");
    expect(html).toContain("If an account exists for that email address");
    expect(html).not.toContain("registered");
    expect(html).toContain('href="/login"');
  });

  it("requests a password reset with generic success for registered or unknown email", async () => {
    const requestedEmails: string[] = [];
    const requestPasswordReset = async ({ email }: { email: string }) => {
      requestedEmails.push(email);

      return ok({ email: email.trim().toLowerCase() });
    };
    const request = new Request("http://example.com/forgot-password", {
      method: "POST",
      body: new URLSearchParams({ email: " Member@Example.COM " }),
    });

    const result = await handleForgotPasswordAction(request, {
      requestPasswordReset,
      db: undefined as never,
      emailSender: undefined as never,
      appBaseUrl: "http://example.com",
    });

    expect(result).toEqual({ status: "reset-requested" });
    expect(requestedEmails).toEqual([" Member@Example.COM "]);
  });

  it("surfaces forgot password input validation without account lookup details", async () => {
    const request = new Request("http://example.com/forgot-password", {
      method: "POST",
      body: new URLSearchParams({ email: "not-an-email" }),
    });

    const result = await handleForgotPasswordAction(request, {
      requestPasswordReset: async () => err("invalid-email"),
      db: undefined as never,
      emailSender: undefined as never,
      appBaseUrl: "http://example.com",
    });
    const html = renderToString(<ForgotPasswordView actionData={result} />);

    expect(result).toEqual({ status: "error", error: "invalid-email" });
    expect(html).toContain("Enter a valid email address.");
    expect(html).not.toContain("account not found");
  });

  it("renders reset password form for valid tokens", () => {
    const html = renderToString(
      <ResetPasswordView status="ready" token="reset-token" />,
    );

    expect(html).toContain("Set new password");
    expect(html).toContain('name="token"');
    expect(html).toContain('value="reset-token"');
  });

  it("maps invalid and expired reset tokens in the loader", () => {
    const invalid = handleResetPasswordLoader(
      new Request("http://example.com/reset-password"),
      {
        validatePasswordResetToken: () => err("invalid-token"),
        db: undefined as never,
      },
    );
    const expired = handleResetPasswordLoader(
      new Request("http://example.com/reset-password?token=expired-token"),
      {
        validatePasswordResetToken: () => err("expired-token"),
        db: undefined as never,
      },
    );

    expect(invalid).toEqual({ status: "invalid-token", token: "" });
    expect(expired).toEqual({
      status: "expired-token",
      token: "expired-token",
    });
    expect(
      renderToString(<ResetPasswordView status={expired.status} />),
    ).toContain("password reset link has expired");
  });

  it("keeps the reset form open when password validation fails", async () => {
    const request = new Request("http://example.com/reset-password", {
      method: "POST",
      body: new URLSearchParams({ token: "valid-token", password: "short" }),
    });

    const result = await handleResetPasswordAction(request, {
      resetPasswordWithToken: async () => err("password-too-short"),
      db: undefined as never,
    });

    expect(result).toEqual({
      status: "password-too-short",
      token: "valid-token",
    });
    expect(
      renderToString(
        <ResetPasswordView status="password-too-short" token="valid-token" />,
      ),
    ).toContain("Password must be at least 8 characters.");
  });

  it("redirects to login after successful password reset", async () => {
    const request = new Request("http://example.com/reset-password", {
      method: "POST",
      body: new URLSearchParams({
        token: "valid-token",
        password: "new-password",
      }),
    });

    const result = await handleResetPasswordAction(request, {
      resetPasswordWithToken: async () => ok({ email: "member@example.com" }),
      db: undefined as never,
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe(
      "/login?passwordReset=1",
    );
  });
});
