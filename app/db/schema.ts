import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appMetadata = sqliteTable("app_metadata", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: text("email_verified_at"),
    createdAt: text("created_at").notNull(),
    modifiedAt: text("modified_at").notNull(),
  },
  (table) => [
    uniqueIndex("users_email_normalized_unique").on(sql`lower(${table.email})`),
    check("users_email_not_blank", sql`length(trim(${table.email})) > 0`),
  ],
);

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const emailVerificationTokens = sqliteTable("email_verification_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const teams = sqliteTable(
  "teams",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
    modifiedAt: text("modified_at").notNull(),
  },
  (table) => [
    uniqueIndex("teams_name_normalized_unique").on(sql`lower(${table.name})`),
    check("teams_name_not_blank", sql`length(trim(${table.name})) > 0`),
  ],
);

export const epics = sqliteTable(
  "epics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    modifiedAt: text("modified_at").notNull(),
  },
  (table) => [
    check("epics_title_not_blank", sql`length(trim(${table.title})) > 0`),
  ],
);

export const tickets = sqliteTable(
  "tickets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "restrict" }),
    epicId: integer("epic_id").references(() => epics.id, {
      onDelete: "restrict",
    }),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: text("type", { enum: ["bug", "feature", "fix"] }).notNull(),
    state: text("state", {
      enum: [
        "new",
        "ready_for_implementation",
        "in_progress",
        "ready_for_acceptance",
        "done",
      ],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
    modifiedAt: text("modified_at").notNull(),
  },
  (table) => [
    check("tickets_title_not_blank", sql`length(trim(${table.title})) > 0`),
    check("tickets_body_not_blank", sql`length(${table.body}) > 0`),
    check(
      "tickets_type_allowed",
      sql`${table.type} in ('bug', 'feature', 'fix')`,
    ),
    check(
      "tickets_state_allowed",
      sql`${table.state} in ('new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done')`,
    ),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorUserId: integer("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("comments_body_not_blank", sql`length(${table.body}) > 0`),
  ],
);
