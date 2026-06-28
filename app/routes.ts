import { index, route } from "@react-router/dev/routes";
import type { RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("signup", "routes/signup.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("verify-email", "routes/verify-email.tsx"),
  route("resend-verification", "routes/resend-verification.tsx"),
  route("board", "routes/board.tsx"),
  route("tickets/new", "routes/tickets.new.tsx"),
  route("tickets/:ticketId", "routes/tickets.$ticketId.tsx"),
  route("tickets/:ticketId/edit", "routes/tickets.$ticketId.edit.tsx"),
  route("teams", "routes/teams.tsx"),
  route("epics", "routes/epics.tsx"),
] satisfies RouteConfig;
