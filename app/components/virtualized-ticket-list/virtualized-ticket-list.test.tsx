import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VirtualizedTicketList } from "./virtualized-ticket-list";

interface Ticket {
  id: string;
  title: string;
}

const tickets: Ticket[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `ticket-${index}`,
  title: `Ticket ${index}`,
}));

describe("VirtualizedTicketList", () => {
  it("renders only the visible windowed subset of items via the render prop", () => {
    const html = renderToString(
      <VirtualizedTicketList
        height={200}
        itemSize={40}
        items={tickets}
        renderItem={(ticket) => <span>{ticket.title}</span>}
      />,
    );

    expect(html).toContain("Ticket 0");
    expect(html).not.toContain(">Ticket 999<");
    expect(html.match(/Ticket \d+/g)?.length).toBeLessThan(tickets.length);
  });

  it("renders each visible item's markup produced by the caller-supplied render prop", () => {
    const html = renderToString(
      <VirtualizedTicketList
        height={80}
        itemSize={40}
        items={tickets.slice(0, 5)}
        renderItem={(ticket) => (
          <strong data-testid={ticket.id}>{ticket.title}</strong>
        )}
      />,
    );

    expect(html).toContain("<strong data-testid=\"ticket-0\">Ticket 0</strong>");
    expect(html).toContain("<strong data-testid=\"ticket-1\">Ticket 1</strong>");
  });
});
