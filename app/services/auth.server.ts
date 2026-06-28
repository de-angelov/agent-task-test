import argon2 from "argon2";
import { randomBytes, randomUUID, createHash } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { err, ok, type Result } from "neverthrow";

import * as schema from "~/db/schema";

export type AuthDb = BetterSQLite3Database<typeof schema>;

export type EmailSender = {
  sendVerificationEmail(input: {
    email: string;
    verificationUrl: string;
  }): Promise<void>;
};

export type SignupError =
  | "invalid-email"
  | "password-too-short"
  | "email-already-registered"
  | "email-delivery-failed";

export type LoginError =
  | "invalid-credentials"
  | "email-not-verified";

export type VerificationError =
  | "invalid-token"
  | "expired-token"
  | "token-already-used";

export type ResendVerificationError =
  | "invalid-email"
  | "account-not-found"
  | "already-verified"
  | "email-delivery-failed";

type AuthServiceDependencies = {
  db: AuthDb;
  emailSender: EmailSender;
  appBaseUrl: string;
  now?: () => Date;
};

type User = typeof schema.users.$inferSelect;

const passwordMinimumLength = 8;
const verificationTokenLifetimeMs = 24 * 60 * 60 * 1000;
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): Result<string, "invalid-email"> {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return err("invalid-email");
  }

  return ok(normalized);
}

export function validatePassword(
  password: string,
): Result<string, "password-too-short"> {
  if (password.length < passwordMinimumLength) {
    return err("password-too-short");
  }

  return ok(password);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function createUserAccount(
  input: { email: string; password: string },
  dependencies: AuthServiceDependencies,
): Promise<Result<{ userId: string; email: string }, SignupError>> {
  const email = normalizeEmail(input.email);
  if (email.isErr()) {
    return err(email.error);
  }

  const password = validatePassword(input.password);
  if (password.isErr()) {
    return err(password.error);
  }

  const existingUser = findUserByEmail(dependencies.db, email.value);
  if (existingUser !== undefined) {
    return err("email-already-registered");
  }

  const now = dependencies.now?.() ?? new Date();
  const userId = randomUUID();
  const passwordHash = await hashPassword(password.value);

  dependencies.db.insert(schema.users).values({
    id: userId,
    email: email.value,
    passwordHash,
    emailVerifiedAt: null,
    createdAt: now.getTime(),
  }).run();

  const token = issueVerificationToken(userId, dependencies);
  const verificationUrl = buildVerificationUrl(dependencies.appBaseUrl, token);

  try {
    await dependencies.emailSender.sendVerificationEmail({
      email: email.value,
      verificationUrl,
    });
  } catch {
    return err("email-delivery-failed");
  }

  return ok({ userId, email: email.value });
}

export async function resendVerificationEmail(
  input: { email: string },
  dependencies: AuthServiceDependencies,
): Promise<Result<{ email: string }, ResendVerificationError>> {
  const email = normalizeEmail(input.email);
  if (email.isErr()) {
    return err(email.error);
  }

  const user = findUserByEmail(dependencies.db, email.value);
  if (user === undefined) {
    return err("account-not-found");
  }

  if (user.emailVerifiedAt !== null) {
    return err("already-verified");
  }

  const token = issueVerificationToken(user.id, dependencies);
  const verificationUrl = buildVerificationUrl(dependencies.appBaseUrl, token);

  try {
    await dependencies.emailSender.sendVerificationEmail({
      email: user.email,
      verificationUrl,
    });
  } catch {
    return err("email-delivery-failed");
  }

  return ok({ email: user.email });
}

export function verifyEmailToken(
  token: string,
  dependencies: Pick<AuthServiceDependencies, "db" | "now">,
): Result<{ email: string }, VerificationError> {
  const now = dependencies.now?.() ?? new Date();
  const tokenHash = hashToken(token);
  const verificationToken = dependencies.db
    .select()
    .from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.tokenHash, tokenHash))
    .get();

  if (verificationToken === undefined || verificationToken.invalidatedAt !== null) {
    return err("invalid-token");
  }

  if (verificationToken.usedAt !== null) {
    return err("token-already-used");
  }

  if (verificationToken.expiresAt <= now.getTime()) {
    return err("expired-token");
  }

  const user = dependencies.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, verificationToken.userId))
    .get();

  if (user === undefined) {
    return err("invalid-token");
  }

  dependencies.db
    .update(schema.emailVerificationTokens)
    .set({ usedAt: now.getTime() })
    .where(eq(schema.emailVerificationTokens.id, verificationToken.id))
    .run();

  dependencies.db
    .update(schema.users)
    .set({ emailVerifiedAt: now.getTime() })
    .where(eq(schema.users.id, user.id))
    .run();

  return ok({ email: user.email });
}

export async function createLoginSession(
  input: { email: string; password: string },
  dependencies: Pick<AuthServiceDependencies, "db" | "now">,
): Promise<Result<{ sessionId: string; email: string }, LoginError>> {
  const email = normalizeEmail(input.email);
  if (email.isErr()) {
    return err("invalid-credentials");
  }

  const user = findUserByEmail(dependencies.db, email.value);
  if (user === undefined) {
    return err("invalid-credentials");
  }

  const isValidPassword = await verifyPassword(user.passwordHash, input.password);
  if (!isValidPassword) {
    return err("invalid-credentials");
  }

  if (user.emailVerifiedAt === null) {
    return err("email-not-verified");
  }

  const now = dependencies.now?.() ?? new Date();
  const sessionId = randomUUID();

  dependencies.db.insert(schema.sessions).values({
    id: sessionId,
    userId: user.id,
    createdAt: now.getTime(),
    expiresAt: now.getTime() + sessionLifetimeMs,
  }).run();

  return ok({ sessionId, email: user.email });
}

export function findAuthenticatedUser(
  sessionId: string | undefined,
  dependencies: Pick<AuthServiceDependencies, "db" | "now">,
): User | undefined {
  if (sessionId === undefined) {
    return undefined;
  }

  const now = dependencies.now?.() ?? new Date();
  const session = dependencies.db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .get();

  if (session === undefined || session.expiresAt <= now.getTime()) {
    return undefined;
  }

  const user = dependencies.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .get();

  if (user === undefined || user.emailVerifiedAt === null) {
    return undefined;
  }

  return user;
}

export function deleteSession(db: AuthDb, sessionId: string | undefined): void {
  if (sessionId === undefined) {
    return;
  }

  db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function findUserByEmail(db: AuthDb, email: string): User | undefined {
  return db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get();
}

function issueVerificationToken(
  userId: string,
  dependencies: Pick<AuthServiceDependencies, "db" | "now">,
): string {
  const now = dependencies.now?.() ?? new Date();
  const token = randomBytes(32).toString("base64url");

  dependencies.db
    .update(schema.emailVerificationTokens)
    .set({ invalidatedAt: now.getTime() })
    .where(
      and(
        eq(schema.emailVerificationTokens.userId, userId),
        isNull(schema.emailVerificationTokens.usedAt),
        isNull(schema.emailVerificationTokens.invalidatedAt),
      ),
    )
    .run();

  dependencies.db.insert(schema.emailVerificationTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    createdAt: now.getTime(),
    expiresAt: now.getTime() + verificationTokenLifetimeMs,
    usedAt: null,
    invalidatedAt: null,
  }).run();

  return token;
}

function buildVerificationUrl(appBaseUrl: string, token: string): string {
  const url = new URL("/verify-email", appBaseUrl);
  url.searchParams.set("token", token);

  return url.toString();
}
