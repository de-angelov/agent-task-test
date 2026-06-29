import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginView } from "./login";
import { ResendVerificationView } from "./resend-verification";
import { SignupView } from "./signup";
import { VerifyEmailView } from "./verify-email";

describe("auth screens", () => {
  it("renders login primary action, signup link, and resend access", () => {
    const html = renderToString(<LoginView />);

    expect(html).toContain("Log in");
    expect(html).toContain('href="/signup"');
    expect(html).toContain("Create an account");
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

  it("renders distinct invalid and expired verification states", () => {
    const invalid = renderToString(<VerifyEmailView status="invalid-token" />);
    const expired = renderToString(<VerifyEmailView status="expired-token" />);

    expect(invalid).toContain("verification link is invalid");
    expect(expired).toContain("verification link has expired");
    expect(invalid).toContain('href="/resend-verification"');
    expect(expired).toContain('href="/resend-verification"');
  });
});
