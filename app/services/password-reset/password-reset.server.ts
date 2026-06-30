import { randomBytes, randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { err, ok, type Result } from "neverthrow";

import * as schema from "../../db/schema";
import {
  hashPassword,
  hashToken,
  normalizeEmail,
  validatePassword,
  type AuthDb,
  type EmailSender,
} from "../auth/auth.server";

export type PasswordResetEmailSender = Pick<
  EmailSender,
  "sendPasswordResetEmail"
>;

export type RequestPasswordResetError =
  | "invalid-email"
  | "email-delivery-failed";

export type ResetPasswordError =
  | "invalid-token"
  | "expired-token"
  | "token-already-used"
  | "password-too-short";

export type PasswordResetTokenValidationError =
  | "invalid-token"
  | "expired-token"
  | "token-already-used";

type PasswordResetServiceDependencies = {
  db: AuthDb;
  emailSender: PasswordResetEmailSender;
  appBaseUrl: string;
  now?: () => Date;
  passwordResetTokenLifetimeMs?: number;
};

type ResetPasswordDependencies = Pick<
  PasswordResetServiceDependencies,
  "db" | "now"
>;

type User = typeof schema.users.$inferSelect;

const defaultPasswordResetTokenLifetimeMs = 15 * 60 * 1000;

export async function requestPasswordReset(
  input: { email: string },
  dependencies: PasswordResetServiceDependencies,
): Promise<Result<{ email: string }, RequestPasswordResetError>> {
  const email = normalizeEmail(input.email);
  if (email.isErr()) {
    return err(email.error);
  }

  const user = findUserByEmail(dependencies.db, email.value);
  if (user === undefined) {
    return ok({ email: email.value });
  }

  const token = issuePasswordResetToken(user.id, dependencies);
  const resetUrl = buildPasswordResetUrl(dependencies.appBaseUrl, token);

  try {
    await dependencies.emailSender.sendPasswordResetEmail({
      email: user.email,
      resetUrl,
    });
  } catch {
    return err("email-delivery-failed");
  }

  return ok({ email: email.value });
}

export async function resetPasswordWithToken(
  input: { token: string; password: string },
  dependencies: ResetPasswordDependencies,
): Promise<Result<{ email: string }, ResetPasswordError>> {
  const password = validatePassword(input.password);
  if (password.isErr()) {
    return err(password.error);
  }

  const tokenResult = findUsablePasswordResetToken(input.token, dependencies);
  if (tokenResult.isErr()) {
    return err(tokenResult.error);
  }

  const now = dependencies.now?.() ?? new Date();
  const { resetToken, user } = tokenResult.value;
  const passwordHash = await hashPassword(password.value);

  dependencies.db
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, user.id))
    .run();

  dependencies.db
    .update(schema.passwordResetTokens)
    .set({ usedAt: now.getTime() })
    .where(eq(schema.passwordResetTokens.id, resetToken.id))
    .run();

  return ok({ email: user.email });
}

export function validatePasswordResetToken(
  input: { token: string },
  dependencies: ResetPasswordDependencies,
): Result<{ email: string }, PasswordResetTokenValidationError> {
  const result = findUsablePasswordResetToken(input.token, dependencies);

  if (result.isErr()) {
    return err(result.error);
  }

  return ok({ email: result.value.user.email });
}

function findUserByEmail(db: AuthDb, email: string): User | undefined {
  return db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get();
}

function findUsablePasswordResetToken(
  token: string,
  dependencies: ResetPasswordDependencies,
): Result<
  {
    resetToken: typeof schema.passwordResetTokens.$inferSelect;
    user: User;
  },
  PasswordResetTokenValidationError
> {
  const now = dependencies.now?.() ?? new Date();
  const tokenHash = hashToken(token);
  const resetToken = dependencies.db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
    .get();

  if (resetToken === undefined || resetToken.invalidatedAt !== null) {
    return err("invalid-token");
  }

  if (resetToken.usedAt !== null) {
    return err("token-already-used");
  }

  if (resetToken.expiresAt <= now.getTime()) {
    return err("expired-token");
  }

  const user = dependencies.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, resetToken.userId))
    .get();

  if (user === undefined) {
    return err("invalid-token");
  }

  return ok({ resetToken, user });
}

function issuePasswordResetToken(
  userId: string,
  dependencies: Pick<
    PasswordResetServiceDependencies,
    "db" | "now" | "passwordResetTokenLifetimeMs"
  >,
): string {
  const now = dependencies.now?.() ?? new Date();
  const token = randomBytes(32).toString("base64url");

  dependencies.db
    .update(schema.passwordResetTokens)
    .set({ invalidatedAt: now.getTime() })
    .where(
      and(
        eq(schema.passwordResetTokens.userId, userId),
        isNull(schema.passwordResetTokens.usedAt),
        isNull(schema.passwordResetTokens.invalidatedAt),
      ),
    )
    .run();

  dependencies.db.insert(schema.passwordResetTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    createdAt: now.getTime(),
    expiresAt:
      now.getTime() +
      (dependencies.passwordResetTokenLifetimeMs ??
        defaultPasswordResetTokenLifetimeMs),
    usedAt: null,
    invalidatedAt: null,
  }).run();

  return token;
}

function buildPasswordResetUrl(appBaseUrl: string, token: string): string {
  const url = new URL("/reset-password", appBaseUrl);
  url.searchParams.set("token", token);

  return url.toString();
}
