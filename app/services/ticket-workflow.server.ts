export const ticketTypes = ["feature", "bug", "task"] as const;
export type TicketType = (typeof ticketTypes)[number];

export const ticketStates = ["backlog", "todo", "in-progress", "done"] as const;
export type TicketState = (typeof ticketStates)[number];

