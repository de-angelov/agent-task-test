import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import * as schema from "~/db/schema";
import { hashPassword, verifyPassword, type AuthDb } from "../auth/auth.server";
import {
  requestPasswordReset,
  resetPasswordWithToken,
  type PasswordResetEmailSender,
} from "./password-reset.server";

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
    CREATE TABLE password_reset_tokens (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE cascade,
      token_hash text NOT NULL UNIQUE,
      expires_at integer NOT NULL,
      used_at integer,
      invalidated_at integer,
      created_at integer NOT NULL
    );
  `);

  return drizzle(sqlite, { schema });
}

function createEmailSender(): PasswordResetEmailSender & { urls: string[] } {
  const urls: string[] = [];

  return {
    urls,
    async sendPasswordResetEmail({ resetUrl }) {
      urls.push(resetUrl);
    },
  };
}

async function insertUser(
  db: AuthDb,
  input: { id?: string; email?: string; password?: string } = {},
) {
  const user = {
    id: input.id ?? "user-1",
    email: input.email ?? "member@example.com",
    password: input.password ?? "old-password",
  };

  db.insert(schema.users).values({
    id: user.id,
    email: user.email,
    passwordHash: await hashPassword(user.password),
    emailVerifiedAt: Date.parse("2026-06-28T00:00:00.000Z"),
    createdAt: Date.parse("2026-06-28T00:00:00.000Z"),
  }).run();

  return user;
}

function tokenFromUrl(url: string): string {
  const token = new URL(url).searchParams.get("token");

  if (token === null) {
    throw new Error("Missing token in reset URL.");
  }

  return token;
}

describe("password reset service", () => {
  it("issues a reset email and consumes the token once to change the password", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();
    await insertUser(db);

    const request = await requestPasswordReset(
      { email: " Member@Example.COM " },
      {
        db,
        emailSender,
        appBaseUrl: "http://example.com",
        now: () => new Date("2026-06-28T00:00:00.000Z"),
      },
    );

    expect(request._unsafeUnwrap()).toEqual({ email: "member@example.com" });
    expect(emailSender.urls).toHaveLength(1);
    expect(emailSender.urls[0]).toContain("http://example.com/reset-password");

    const token = tokenFromUrl(emailSender.urls[0]);
    const storedToken = db.select().from(schema.passwordResetTokens).get();

    expect(storedToken?.tokenHash).not.toBe(token);

    const reset = await resetPasswordWithToken(
      { token, password: "new-password" },
      {
        db,
        now: () => new Date("2026-06-28T00:01:00.000Z"),
      },
    );

    expect(reset._unsafeUnwrap()).toEqual({ email: "member@example.com" });

    const user = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "member@example.com"))
      .get();

    expect(user?.passwordHash).not.toBe("new-password");
    await expect(verifyPassword(user?.passwordHash ?? "", "new-password"))
      .resolves.toBe(true);

    const reused = await resetPasswordWithToken(
      { token, password: "another-password" },
      {
        db,
        now: () => new Date("2026-06-28T00:02:00.000Z"),
      },
    );

    expect(reused._unsafeUnwrapErr()).toBe("token-already-used");
  });

  it("expires reset tokens after the configured lifetime", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();
    await insertUser(db);

    await requestPasswordReset(
      { email: "member@example.com" },
      {
        db,
        emailSender,
        appBaseUrl: "http://example.com",
        now: () => new Date("2026-06-28T00:00:00.000Z"),
        passwordResetTokenLifetimeMs: 60 * 1000,
      },
    );

    const expired = await resetPasswordWithToken(
      { token: tokenFromUrl(emailSender.urls[0]), password: "new-password" },
      {
        db,
        now: () => new Date("2026-06-28T00:01:00.001Z"),
      },
    );

    expect(expired._unsafeUnwrapErr()).toBe("expired-token");
  });

  it("invalidates earlier unused reset tokens when a new token is issued", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();
    await insertUser(db);

    await requestPasswordReset(
      { email: "member@example.com" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );
    const firstToken = tokenFromUrl(emailSender.urls[0]);

    await requestPasswordReset(
      { email: "member@example.com" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );
    const secondToken = tokenFromUrl(emailSender.urls[1]);

    expect(
      (
        await resetPasswordWithToken(
          { token: firstToken, password: "new-password" },
          { db },
        )
      )._unsafeUnwrapErr(),
    ).toBe("invalid-token");
    expect(
      (
        await resetPasswordWithToken(
          { token: secondToken, password: "new-password" },
          { db },
        )
      ).isOk(),
    ).toBe(true);
  });

  it("does not reveal whether an email address is registered", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();
    await insertUser(db);

    const known = await requestPasswordReset(
      { email: "member@example.com" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );
    const unknown = await requestPasswordReset(
      { email: "unknown@example.com" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );

    expect(known._unsafeUnwrap()).toEqual({ email: "member@example.com" });
    expect(unknown._unsafeUnwrap()).toEqual({ email: "unknown@example.com" });
    expect(emailSender.urls).toHaveLength(1);
    expect(db.select().from(schema.passwordResetTokens).all()).toHaveLength(1);
  });

  it("rejects invalid reset inputs", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();

    expect(
      (
        await requestPasswordReset(
          { email: "not-an-email" },
          { db, emailSender, appBaseUrl: "http://example.com" },
        )
      )._unsafeUnwrapErr(),
    ).toBe("invalid-email");
    expect(
      (
        await resetPasswordWithToken(
          { token: "missing-token", password: "1234567" },
          { db },
        )
      )._unsafeUnwrapErr(),
    ).toBe("password-too-short");
  });
});
