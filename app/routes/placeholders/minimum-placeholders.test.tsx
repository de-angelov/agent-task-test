import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginView } from "../auth/login";
import { ResendVerificationView } from "../auth/resend-verification";
import { SignupView } from "../auth/signup";
import { loader as verifyEmailLoader, VerifyEmailView } from "../auth/verify-email";
import { BoardView, loader as boardLoader } from "../board/board";
import { EpicsView } from "../epics/epics";
import { TeamsView } from "../teams/teams";
import { TicketDetailsView } from "../tickets/details";
import { TicketEditView } from "../tickets/edit";
import { TicketCreateView } from "../tickets/new";

describe("minimum placeholder routes", () => {
  it("renders authentication placeholders", () => {
    const signup = renderToString(<SignupView />);
    const login = renderToString(<LoginView />);
    const resend = renderToString(<ResendVerificationView />);

    expect(signup).toContain("Create account");
    expect(signup).toContain("Email address");
    expect(signup).toContain('href="/login"');
    expect(login).toContain("Log in");
    expect(login).toContain('href="/signup"');
    expect(login).toContain('href="/resend-verification"');
    expect(login).toContain("Resend verification email");
    expect(resend).toContain("Send verification email");
    expect(resend).toContain('href="/login"');
    expect(resend).toContain('href="/signup"');
  });

  it("renders email verification result states", () => {
    expect(renderToString(<LoginView verified />)).toContain(
      "Email verified. You can now log in.",
    );
    expect(renderToString(<VerifyEmailView status="invalid-token" />)).toContain(
      "verification link is invalid",
    );
    expect(renderToString(<VerifyEmailView status="expired-token" />)).toContain(
      "verification link has expired",
    );
    expect(renderToString(<VerifyEmailView status="invalid-token" />)).toContain(
      "Send a new verification email",
    );
    expect(
      renderToString(<VerifyEmailView status="token-already-used" />),
    ).toContain("already used");
    expect(renderToString(<VerifyEmailView status="expired-token" />)).toContain(
      'href="/resend-verification"',
    );
  });

  it("renders board and ticket placeholders", () => {
    const board = renderToString(<BoardView />);
    const create = renderToString(<TicketCreateView />);
    const details = renderToString(
      <TicketDetailsView
        data={{ status: "not-found", ticketId: "TICKET-1" }}
      />,
    );
    const edit = renderToString(
      <TicketEditView
        data={{
          status: "not-found",
          ticketId: "TICKET-1",
          userEmail: "user@example.com",
        }}
      />,
    );

    expect(board).toContain("Ready for implementation");
    expect(board).toContain("Create ticket");
    expect(board).toContain("user@example.com");
    expect(board).toContain("Log out");
    expect(create).toContain("Ticket details");
    expect(details).toContain("TICKET-1");
    expect(details).toContain("was not found.");
    expect(edit).toContain("TICKET-1");
    expect(edit).toContain("was not found.");
  });

  it("keeps authenticated navigation off public authentication screens", () => {
    expect(renderToString(<LoginView />)).not.toContain("Log out");
    expect(renderToString(<SignupView />)).not.toContain("Log out");
    expect(renderToString(<ResendVerificationView />)).not.toContain("Log out");
    expect(renderToString(<VerifyEmailView />)).not.toContain("Log out");
  });

  it("renders team and epic management placeholders", () => {
    expect(renderToString(<TeamsView />)).toContain("Create team");
    expect(renderToString(<EpicsView />)).toContain("Create epic");
  });

  it("keeps public verification route boundary", async () => {
    await expect(
      verifyEmailLoader({
        request: new Request("http://example.com/verify-email"),
      }),
    ).resolves.toEqual({ status: "invalid-token" });
  });

  it("redirects unauthenticated users away from business routes", async () => {
    await expect(
      boardLoader({ request: new Request("http://example.com/board") }),
    ).rejects.toMatchObject({ status: 302 });
  });
});
