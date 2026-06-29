import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../app/db/schema";
import {
  developmentSeedUser,
  seedDevelopmentUser,
} from "../app/services/development-seed.server";

const databaseUrl = process.env.DATABASE_URL ?? "local.db";
const sqlite = new Database(databaseUrl);
sqlite.pragma("foreign_keys = ON");

try {
  const result = await seedDevelopmentUser({
    db: drizzle(sqlite, { schema }),
  });
  const action = result.created ? "Created" : "Refreshed";

  console.log(
    `${action} verified development user ${developmentSeedUser.email} in ${databaseUrl}.`,
  );
} finally {
  sqlite.close();
}
