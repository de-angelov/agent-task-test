export const ticketTypes = ["task", "bug", "chore"] as const;
export type TicketType = (typeof ticketTypes)[number];

export const ticketStates = ["todo", "in_progress", "done"] as const;
export type TicketState = (typeof ticketStates)[number];
