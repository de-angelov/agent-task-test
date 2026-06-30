import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~/db/client.server";
import * as schema from "~/db/schema";
import { createEpic } from "~/services/epics/epics.server";
import { createSessionCookie } from "~/services/session/session.server";
import { createTicket } from "~/services/tickets/tickets.server";
import { type TicketState } from "~/services/tickets/ticket-workflow";
import { createTeam } from "~/services/teams/teams.server";

import { loader, TicketDetailsView } from "./details";

const now = new Date("2026-06-30T10:00:00.000Z");
const userId = "user-1";
const sessionId = "session-1";

beforeEach(() => {
  db.delete(schema.tickets).run();
  db.delete(schema.sessions).run();
  db.delete(schema.epics).run();
  db.delete(schema.teams).run();
  db.delete(schema.users).run();

  db.insert(schema.users)
    .values({
      id: userId,
      email: "user@example.com",
      passwordHash: "hash",
      emailVerifiedAt: now.getTime(),
      createdAt: now.getTime(),
    })
    .run();

  db.insert(schema.sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt: now.getTime() + 7 * 24 * 60 * 60 * 1000,
      createdAt: now.getTime(),
    })
    .run();
});

async function createAuthedRequest(ticketId?: string) {
  const cookie = (await createSessionCookie(sessionId)).split(";")[0];

  return new Request(`http://example.com/tickets/${ticketId ?? ""}`, {
    headers: {
      Cookie: cookie,
    },
  });
}

function renderDetails(data: Parameters<typeof TicketDetailsView>[0]["data"]) {
  return renderToString(<TicketDetailsView data={data} />);
}

function createTeamForTest(name = "Platform") {
  return createTeam(db, { name }, { now: () => now })._unsafeUnwrap();
}

function createEpicForTest(teamId: string, title = "Launch Plan") {
  return createEpic(
    db,
    {
      teamId,
      title,
      description: "Coordinate the MVP launch",
    },
    { now: () => now },
  )._unsafeUnwrap();
}

describe("ticket details route", () => {
  it("loads ticket details for an authenticated request", async () => {
    const team = createTeamForTest();
    const epic = createEpicForTest(team.id);
    const ticket = createTicket(
      db,
      {
        teamId: team.id,
        epicId: epic.id,
        createdBy: userId,
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
      },
      { now: () => now },
    )._unsafeUnwrap();

    await expect(
      loader({
        request: await createAuthedRequest(ticket.id),
        params: {
          ticketId: ticket.id,
        },
      }),
    ).resolves.toEqual({
      status: "found",
      ticket: {
        ...ticket,
        teamName: "Platform",
        epicTitle: "Launch Plan",
        createdByEmail: "user@example.com",
      },
    });
  });

  it("renders ticket fields and the edit navigation link", () => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "backlog",
        teamId: "team-1",
        teamName: "Platform",
        epicId: "epic-1",
        epicTitle: "Launch Plan",
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
    });

    expect(html).toContain("Create service");
    expect(html).toContain("Create a focused backend service");
    expect(html).toContain("<dt>Type</dt><dd>feature</dd>");
    expect(html).toContain("<dt>Team</dt><dd>Platform</dd>");
    expect(html).toContain("<dt>Epic</dt><dd>Launch Plan</dd>");
    expect(html).toContain("<dt>Created by</dt><dd>user@example.com</dd>");
    expect(html).toContain(
      '<dt>Created timestamp</dt><dd><time dateTime="2026-06-30T10:00:00.000Z">',
    );
    expect(html).toContain(
      '<dt>Modified timestamp</dt><dd><time dateTime="2026-06-30T10:30:00.000Z">',
    );
    expect(html).toContain('href="/tickets/ticket-1/edit"');
    expect(html.match(/href="\/tickets\/ticket-1\/edit"/g)).toHaveLength(1);
  });

  it("renders No epic when the ticket has no epic", () => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state: "todo",
        teamId: "team-1",
        teamName: "Platform",
        epicId: null,
        epicTitle: null,
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
    });

    expect(html).toContain("<dt>Epic</dt><dd>No epic</dd>");
  });

  it.each([
    ["backlog", "Backlog"],
    ["todo", "Todo"],
    ["in-progress", "In progress"],
    ["done", "Done"],
  ] as const)("maps %s to %s", (state, label) => {
    const html = renderDetails({
      status: "found",
      ticket: {
        id: "ticket-1",
        title: "Create service",
        body: "Create a focused backend service",
        type: "feature",
        state,
        teamId: "team-1",
        teamName: "Platform",
        epicId: null,
        epicTitle: null,
        createdBy: userId,
        createdByEmail: "user@example.com",
        createdAt: "2026-06-30T10:00:00.000Z",
        modifiedAt: "2026-06-30T10:30:00.000Z",
      },
    });

    expect(html).toContain(`<dt>State</dt><dd>${label}</dd>`);
  });

  it("renders a not-found message for missing ticket ids", () => {
    const html = renderDetails({
      status: "not-found",
      ticketId: "missing-ticket",
    });

    expect(html).toContain("Ticket ");
    expect(html).toContain("missing-ticket");
    expect(html).toContain("was not found.");
    expect(html).not.toContain('/tickets/missing-ticket/edit');
  });

  it("returns not-found for unknown ticket ids after authentication", async () => {
    await expect(
      loader({
        request: await createAuthedRequest("missing-ticket"),
        params: {
          ticketId: "missing-ticket",
        },
      }),
    ).resolves.toEqual({
      status: "not-found",
      ticketId: "missing-ticket",
    });
  });

  it("requires authentication before reading details", async () => {
    await expect(
      loader({
        request: new Request("http://example.com/tickets/ticket-1"),
        params: {
          ticketId: "ticket-1",
        },
      }),
    ).rejects.toMatchObject({
      status: 302,
    });
  });
});
