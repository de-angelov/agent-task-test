import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import {
  createLoginSession,
  hashPassword,
  verifyPassword,
  type AuthDb,
} from "./auth.server";
import {
  developmentSeedUser,
  seedDevelopmentUser,
} from "./development-seed.server";

function createTestDb(): AuthDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      email_verified_at integer,
      created_at integer NOT NULL
    );
    CREATE TABLE email_verification_tokens (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      token_hash text NOT NULL UNIQUE,
      expires_at integer NOT NULL,
      used_at integer,
      invalidated_at integer,
      created_at integer NOT NULL
    );
    CREATE TABLE sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      expires_at integer NOT NULL,
      created_at integer NOT NULL
    );
  `);

  return drizzle(sqlite, { schema });
}

function countUsers(db: AuthDb): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .get();

  return result?.count ?? 0;
}

describe("development seed user", () => {
  it("creates a verified test user whose password works with normal login", async () => {
    const db = createTestDb();
    const now = new Date("2026-06-29T10:00:00.000Z");

    const seeded = await seedDevelopmentUser({ db, now: () => now });
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, developmentSeedUser.email))
      .get();

    expect(seeded.created).toBe(true);
    expect(user?.id).toBe(seeded.userId);
    expect(user?.passwordHash).not.toBe(developmentSeedUser.password);
    expect(user?.passwordHash).toContain("argon2id");
    expect(user?.emailVerifiedAt).toBe(now.getTime());
    await expect(
      verifyPassword(user?.passwordHash ?? "", developmentSeedUser.password),
    ).resolves.toBe(true);

    const session = await createLoginSession(
      {
        email: developmentSeedUser.email,
        password: developmentSeedUser.password,
      },
      { db },
    );

    expect(session.isOk()).toBe(true);
  });

  it("refreshes the existing test user without creating duplicates", async () => {
    const db = createTestDb();
    const existingPasswordHash = await hashPassword("old-password");
    db.insert(schema.users).values({
      id: "existing-user",
      email: developmentSeedUser.email,
      passwordHash: existingPasswordHash,
      emailVerifiedAt: null,
      createdAt: new Date("2026-06-28T10:00:00.000Z").getTime(),
    }).run();

    const firstRun = await seedDevelopmentUser({
      db,
      now: () => new Date("2026-06-29T10:00:00.000Z"),
    });
    const secondRun = await seedDevelopmentUser({
      db,
      now: () => new Date("2026-06-29T11:00:00.000Z"),
    });
    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, developmentSeedUser.email))
      .get();

    expect(firstRun).toEqual({
      userId: "existing-user",
      email: developmentSeedUser.email,
      created: false,
    });
    expect(secondRun.userId).toBe("existing-user");
    expect(countUsers(db)).toBe(1);
    expect(user?.createdAt).toBe(
      new Date("2026-06-28T10:00:00.000Z").getTime(),
    );
    expect(user?.emailVerifiedAt).toBe(
      new Date("2026-06-29T11:00:00.000Z").getTime(),
    );
    await expect(
      verifyPassword(user?.passwordHash ?? "", developmentSeedUser.password),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(user?.passwordHash ?? "", "old-password"),
    ).resolves.toBe(false);
  });
});
