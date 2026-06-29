import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import * as schema from "../db/schema";

import { hashPassword, normalizeEmail, type AuthDb } from "./auth.server";

export const developmentSeedUser = {
  email: "test@test.com",
  password: "test",
} as const;

export type DevelopmentSeedUserResult = {
  userId: string;
  email: string;
  created: boolean;
};

type DevelopmentSeedUserDependencies = {
  db: AuthDb;
  now?: () => Date;
};

export async function seedDevelopmentUser(
  dependencies: DevelopmentSeedUserDependencies,
): Promise<DevelopmentSeedUserResult> {
  const normalizedEmail = normalizeEmail(developmentSeedUser.email);

  if (normalizedEmail.isErr()) {
    throw new Error("Development seed user email is invalid.");
  }

  const now = dependencies.now?.() ?? new Date();
  const passwordHash = await hashPassword(developmentSeedUser.password);
  const existingUser = dependencies.db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail.value))
    .get();

  if (existingUser !== undefined) {
    dependencies.db
      .update(schema.users)
      .set({
        passwordHash,
        emailVerifiedAt: now.getTime(),
      })
      .where(eq(schema.users.id, existingUser.id))
      .run();

    return {
      userId: existingUser.id,
      email: existingUser.email,
      created: false,
    };
  }

  const userId = randomUUID();
  dependencies.db.insert(schema.users).values({
    id: userId,
    email: normalizedEmail.value,
    passwordHash,
    emailVerifiedAt: now.getTime(),
    createdAt: now.getTime(),
  }).run();

  return {
    userId,
    email: normalizedEmail.value,
    created: true,
  };
}
