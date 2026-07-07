import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import Database from "better-sqlite3";

const developmentSeedUser = {
  email: "test@test.com",
  password: "test",
};

// Keep this minimal mirror aligned with app/services/auth and development-seed.
function normalizeEmail(email) {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Development seed user email is invalid.");
  }

  return normalized;
}

async function seedDevelopmentUser(database) {
  const email = normalizeEmail(developmentSeedUser.email);
  const now = Date.now();
  const passwordHash = await argon2.hash(developmentSeedUser.password, {
    type: argon2.argon2id,
  });
  const existingUser = database
    .prepare("select id, email from users where email = ?")
    .get(email);

  if (existingUser !== undefined) {
    database
      .prepare(
        "update users set password_hash = ?, email_verified_at = ? where id = ?",
      )
      .run(passwordHash, now, existingUser.id);

    return { email: existingUser.email, created: false };
  }

  database
    .prepare(
      "insert into users (id, email, password_hash, email_verified_at, created_at) values (?, ?, ?, ?, ?)",
    )
    .run(randomUUID(), email, passwordHash, now, now);

  return { email, created: true };
}

const databaseUrl = process.env.DATABASE_URL ?? "local.db";
const sqlite = new Database(databaseUrl);
sqlite.pragma("foreign_keys = ON");

try {
  const result = await seedDevelopmentUser(sqlite);
  const action = result.created ? "Created" : "Refreshed";

  console.log(
    `${action} verified development user ${result.email} in ${databaseUrl}.`,
  );
} finally {
  sqlite.close();
}
