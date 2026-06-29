import { createCookie, redirect } from "react-router";

import { db } from "~/db/client.server";

import {
  deleteSession,
  findAuthenticatedUser,
  type AuthDb,
} from "../auth/auth.server";

const sessionCookie = createCookie("project_tracker_session", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  secrets: [process.env.SESSION_SECRET ?? "development-session-secret"],
});

export async function getSessionId(request: Request): Promise<string | undefined> {
  const value = await sessionCookie.parse(request.headers.get("Cookie"));

  return typeof value === "string" ? value : undefined;
}

export async function createSessionCookie(sessionId: string): Promise<string> {
  return sessionCookie.serialize(sessionId, {
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function destroySessionCookie(): Promise<string> {
  return sessionCookie.serialize("", { maxAge: 0 });
}

export async function requireAuthenticatedUser(
  request: Request,
  authDb: AuthDb = db,
) {
  const sessionId = await getSessionId(request);
  const user = findAuthenticatedUser(sessionId, { db: authDb });

  if (user === undefined) {
    throw redirect("/login");
  }

  return user;
}

export async function logout(request: Request, authDb: AuthDb = db) {
  const sessionId = await getSessionId(request);
  deleteSession(authDb, sessionId);

  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySessionCookie(),
    },
  });
}
