import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "~/db/schema";

import {
  createLoginSession,
  createUserAccount,
  findAuthenticatedUser,
  hashPassword,
  normalizeEmail,
  resendVerificationEmail,
  validatePassword,
  verifyEmailToken,
  verifyPassword,
  type AuthDb,
  type EmailSender,
} from "./auth.server";

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

function createEmailSender(): EmailSender & { urls: string[] } {
  const urls: string[] = [];

  return {
    urls,
    async sendVerificationEmail({ verificationUrl }) {
      urls.push(verificationUrl);
    },
  };
}

function tokenFromUrl(url: string): string {
  const token = new URL(url).searchParams.get("token");

  if (token === null) {
    throw new Error("Missing token in verification URL.");
  }

  return token;
}

describe("auth service", () => {
  it("normalizes email addresses and enforces password length", () => {
    expect(normalizeEmail("  USER@Example.COM ")._unsafeUnwrap()).toBe(
      "user@example.com",
    );
    expect(normalizeEmail("not-an-email")._unsafeUnwrapErr()).toBe(
      "invalid-email",
    );
    expect(validatePassword("1234567")._unsafeUnwrapErr()).toBe(
      "password-too-short",
    );
    expect(validatePassword("12345678")._unsafeUnwrap()).toBe("12345678");
  });

  it("hashes passwords without storing plain text", async () => {
    const hash = await hashPassword("correct-password");

    expect(hash).not.toBe("correct-password");
    expect(hash).toContain("argon2id");
    await expect(verifyPassword(hash, "correct-password")).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("creates unique normalized user accounts and sends verification email", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();

    const created = await createUserAccount(
      { email: " Member@Example.COM ", password: "password-1" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );
    const duplicate = await createUserAccount(
      { email: "member@example.com", password: "password-2" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );

    expect(created._unsafeUnwrap().email).toBe("member@example.com");
    expect(duplicate._unsafeUnwrapErr()).toBe("email-already-registered");
    expect(emailSender.urls).toHaveLength(1);
    expect(emailSender.urls[0]).toContain("http://example.com/verify-email");
    expect(
      db.select().from(schema.users).where(eq(schema.users.email, "member@example.com")).get()
        ?.passwordHash,
    ).not.toBe("password-1");
  });

  it("expires verification tokens after 24 hours and keeps them single-use", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();
    const issuedAt = new Date("2026-06-28T00:00:00.000Z");
    await createUserAccount(
      { email: "member@example.com", password: "password-1" },
      {
        db,
        emailSender,
        appBaseUrl: "http://example.com",
        now: () => issuedAt,
      },
    );

    const expired = verifyEmailToken(tokenFromUrl(emailSender.urls[0]), {
      db,
      now: () => new Date("2026-06-29T00:00:00.001Z"),
    });

    expect(expired._unsafeUnwrapErr()).toBe("expired-token");

    const freshEmailSender = createEmailSender();
    await resendVerificationEmail(
      { email: "member@example.com" },
      {
        db,
        emailSender: freshEmailSender,
        appBaseUrl: "http://example.com",
        now: () => new Date("2026-06-28T01:00:00.000Z"),
      },
    );
    const freshToken = tokenFromUrl(freshEmailSender.urls[0]);

    expect(
      verifyEmailToken(freshToken, {
        db,
        now: () => new Date("2026-06-28T01:01:00.000Z"),
      })._unsafeUnwrap().email,
    ).toBe("member@example.com");
    expect(
      verifyEmailToken(freshToken, {
        db,
        now: () => new Date("2026-06-28T01:02:00.000Z"),
      })._unsafeUnwrapErr(),
    ).toBe("token-already-used");
  });

  it("invalidates earlier unused verification tokens when resending", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();
    await createUserAccount(
      { email: "member@example.com", password: "password-1" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );
    const firstToken = tokenFromUrl(emailSender.urls[0]);

    await resendVerificationEmail(
      { email: "member@example.com" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );
    const secondToken = tokenFromUrl(emailSender.urls[1]);

    expect(verifyEmailToken(firstToken, { db })._unsafeUnwrapErr()).toBe(
      "invalid-token",
    );
    expect(verifyEmailToken(secondToken, { db }).isOk()).toBe(true);
  });

  it("blocks login before verification and creates authenticated sessions after verification", async () => {
    const db = createTestDb();
    const emailSender = createEmailSender();
    await createUserAccount(
      { email: "member@example.com", password: "password-1" },
      { db, emailSender, appBaseUrl: "http://example.com" },
    );

    expect(
      (
        await createLoginSession(
          { email: "member@example.com", password: "password-1" },
          { db },
        )
      )._unsafeUnwrapErr(),
    ).toBe("email-not-verified");

    verifyEmailToken(tokenFromUrl(emailSender.urls[0]), { db });
    const session = await createLoginSession(
      { email: " MEMBER@example.com ", password: "password-1" },
      { db },
    );

    expect(session.isOk()).toBe(true);
    expect(
      findAuthenticatedUser(session._unsafeUnwrap().sessionId, { db })?.email,
    ).toBe("member@example.com");
  });
});
