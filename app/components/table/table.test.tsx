import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "../button";
import { Table, type TableColumn } from "./table";

interface TicketRow {
  id: string;
  status: string;
  title: string;
}

const columns: Array<TableColumn<TicketRow>> = [
  {
    header: "Title",
    id: "title",
    renderCell: (ticket) => ticket.title,
  },
  {
    header: "Status",
    id: "status",
    renderCell: (ticket) => <strong>{ticket.status}</strong>,
  },
  {
    header: "Actions",
    id: "actions",
    renderCell: (ticket) => (
      <Button aria-label={`Open ${ticket.title}`} variant="secondary">
        Open
      </Button>
    ),
  },
];

describe("Table", () => {
  it("renders accessible column headers and structured row cells", () => {
    const html = renderToString(
      <Table
        caption="Tickets"
        columns={columns}
        getRowKey={(ticket) => ticket.id}
        rows={[
          {
            id: "ticket-1",
            status: "Ready",
            title: "Create teams",
          },
        ]}
      />,
    );

    expect(html).toContain("<caption>Tickets</caption>");
    expect(html).toContain("<th scope=\"col\">Title</th>");
    expect(html).toContain("<th scope=\"col\">Status</th>");
    expect(html).toContain("Create teams");
    expect(html).toContain("<strong>Ready</strong>");
    expect(html).toContain("aria-label=\"Open Create teams\"");
    expect(html).toContain("Open");
  });

  it("allows callers to render custom table rows", () => {
    const html = renderToString(
      <Table
        columns={columns.slice(0, 2)}
        getRowKey={(ticket) => ticket.id}
        renderRow={(ticket) => (
          <tr key={ticket.id}>
            <th scope="row">{ticket.title}</th>
            <td>{ticket.status}</td>
          </tr>
        )}
        rows={[
          {
            id: "ticket-2",
            status: "In progress",
            title: "Add comments",
          },
        ]}
      />,
    );

    expect(html).toContain("<th scope=\"row\">Add comments</th>");
    expect(html).toContain("<td>In progress</td>");
  });

  it("renders a loading state inside the table body", () => {
    const html = renderToString(
      <Table
        columns={columns}
        getRowKey={(ticket) => ticket.id}
        isLoading
        messages={{ loading: "Loading tickets..." }}
        rows={[]}
      />,
    );

    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("colSpan=\"3\"");
    expect(html).toContain("Loading tickets...");
  });

  it("renders an alert when an error is present", () => {
    const html = renderToString(
      <Table
        columns={columns}
        error="Unable to load tickets."
        getRowKey={(ticket) => ticket.id}
        rows={[]}
      />,
    );

    expect(html).toContain("role=\"alert\"");
    expect(html).toContain("Unable to load tickets.");
  });

  it("renders an empty state when there are no rows", () => {
    const html = renderToString(
      <Table
        columns={columns}
        getRowKey={(ticket) => ticket.id}
        messages={{ empty: "No tickets yet." }}
        rows={[]}
      />,
    );

    expect(html).toContain("No tickets yet.");
  });
});
