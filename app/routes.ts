import { index, route } from "@react-router/dev/routes";
import type { RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home/home.tsx"),
  route("signup", "routes/auth/signup.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("forgot-password", "routes/auth/forgot-password.tsx"),
  route("reset-password", "routes/auth/reset-password.tsx"),
  route("logout", "routes/auth/logout.tsx"),
  route("verify-email", "routes/auth/verify-email.tsx"),
  route("resend-verification", "routes/auth/resend-verification.tsx"),
  route("board", "routes/board/board.tsx"),
  route("tickets/new", "routes/tickets/new.tsx"),
  route("tickets/:ticketId", "routes/tickets/details.tsx"),
  route("tickets/:ticketId/edit", "routes/tickets/edit.tsx"),
  route("teams", "routes/teams/teams.tsx"),
  route("epics", "routes/epics/epics.tsx"),
] satisfies RouteConfig;
