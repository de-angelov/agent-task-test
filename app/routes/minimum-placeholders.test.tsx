import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BoardView, loader as boardLoader } from "./board";
import { EpicsView } from "./epics";
import { LoginView } from "./login";
import { SignupView } from "./signup";
import { TicketDetailsView } from "./tickets.$ticketId";
import { TicketEditView } from "./tickets.$ticketId.edit";
import { TicketCreateView } from "./tickets.new";
import { TeamsView } from "./teams";
import { loader as verifyEmailLoader, VerifyEmailView } from "./verify-email";

describe("minimum placeholder routes", () => {
  it("renders authentication placeholders", () => {
    const signup = renderToString(<SignupView />);
    const login = renderToString(<LoginView />);

    expect(signup).toContain("Create account");
    expect(signup).toContain("Email address");
    expect(login).toContain("Log in");
    expect(login).toContain("Resend verification email");
  });

  it("renders email verification result states", () => {
    expect(renderToString(<VerifyEmailView status="invalid-token" />)).toContain(
      "verification link is invalid",
    );
    expect(renderToString(<VerifyEmailView status="invalid-token" />)).toContain(
      "Send a new verification email",
    );
    expect(
      renderToString(<VerifyEmailView status="token-already-used" />),
    ).toContain("already used");
    expect(renderToString(<VerifyEmailView status="expired-token" />)).toContain(
      "Send a new verification email",
    );
  });

  it("renders board and ticket placeholders", () => {
    const board = renderToString(<BoardView />);
    const create = renderToString(<TicketCreateView />);
    const details = renderToString(<TicketDetailsView ticketId="TICKET-1" />);
    const edit = renderToString(<TicketEditView ticketId="TICKET-1" />);

    expect(board).toContain("Ready for implementation");
    expect(board).toContain("Create ticket");
    expect(board).toContain("user@example.com");
    expect(board).toContain("Log out");
    expect(create).toContain("Ticket details");
    expect(details).toContain("Viewing ticket TICKET-1");
    expect(edit).toContain("Editing ticket TICKET-1");
  });

  it("keeps authenticated navigation off public authentication screens", () => {
    expect(renderToString(<LoginView />)).not.toContain("Log out");
    expect(renderToString(<SignupView />)).not.toContain("Log out");
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
