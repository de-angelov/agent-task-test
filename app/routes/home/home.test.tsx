import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import type { AppDb } from "~/services/teams/teams.server";

type HomeModule = typeof import("./home");

const sessionId = "session-1";
const userId = "user-1";
const userEmail = "user@example.com";

const tempDirectory = mkdtempSync(join(tmpdir(), "home-loader-"));
const databasePath = join(tempDirectory, "home.sqlite");

let sqlite: Database.Database;
let database: AppDb;
let home: HomeModule;
let sessionCookieHeader: string;

function seedAuthentication() {
  const timestamp = Date.now();

  database.insert(schema.users).values({
    id: userId,
    email: userEmail,
    passwordHash: "hash",
    emailVerifiedAt: timestamp,
    createdAt: timestamp,
  }).run();

  database.insert(schema.sessions).values({
    id: sessionId,
    userId,
    createdAt: timestamp,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }).run();
}

beforeAll(async () => {
  process.env.DATABASE_URL = databasePath;

  sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      email_verified_at integer,
      created_at integer NOT NULL
    );

    CREATE TABLE sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      expires_at integer NOT NULL,
      created_at integer NOT NULL
    );
  `);

  const { db: appDb } = await import("~/db/client.server");
  database = appDb as AppDb;
  const { createSessionCookie } = await import(
    "~/services/session/session.server"
  );
  sessionCookieHeader = (await createSessionCookie(sessionId)).split(";")[0];
  home = await import("./home");
});

beforeEach(() => {
  database.delete(schema.sessions).run();
  database.delete(schema.users).run();
});

describe("home route", () => {
  it("redirects unauthenticated visitors to log in", async () => {
    const response = await home
      .loader({ request: new Request("http://example.com/") })
      .catch((thrown: unknown) => thrown);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/login");
  });

  it("redirects authenticated visitors to the board", async () => {
    seedAuthentication();

    const response = await home.loader({
      request: new Request("http://example.com/", {
        headers: { cookie: sessionCookieHeader },
      }),
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/board");
  });
});
