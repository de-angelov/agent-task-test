import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BoardView, loader as boardLoader } from "./board";
import { EpicsView } from "./epics";
import { action as loginAction, LoginView } from "./login";
import {
  action as resendVerificationAction,
} from "./resend-verification";
import { action as signupAction, SignupView } from "./signup";
import {
  TicketDetailsView,
  loader as ticketDetailsLoader,
} from "./tickets.$ticketId";
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
    expect(renderToString(<VerifyEmailView status="success" />)).toContain(
      "Email verified.",
    );
    expect(renderToString(<VerifyEmailView status="invalid-token" />)).toContain(
      "verification link is invalid",
    );
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
    expect(create).toContain("Ticket details");
    expect(details).toContain("Viewing ticket TICKET-1");
    expect(edit).toContain("Editing ticket TICKET-1");
  });

  it("renders team and epic management placeholders", () => {
    expect(renderToString(<TeamsView />)).toContain("Create or rename team");
    expect(renderToString(<EpicsView />)).toContain("Create or edit epic");
  });

  it("keeps route loaders and actions as placeholder boundaries", async () => {
    await expect(signupAction()).resolves.toEqual({
      status: "placeholder-signup",
    });
    await expect(loginAction()).resolves.toEqual({
      status: "placeholder-login",
    });
    await expect(resendVerificationAction()).resolves.toEqual({
      status: "placeholder-verification-email-resend",
    });
    await expect(boardLoader()).resolves.toEqual({
      status: "placeholder-board",
    });
    await expect(
      ticketDetailsLoader({ params: { ticketId: "TICKET-1" } }),
    ).resolves.toEqual({
      status: "placeholder-ticket-details",
      ticketId: "TICKET-1",
    });
    await expect(
      verifyEmailLoader({
        request: new Request("http://example.com/verify-email?status=expired-token"),
      }),
    ).resolves.toEqual({ status: "expired-token" });
  });
});
