# Ticket Tracker

A React Router application for tracking teams, epics, and tickets on a
drag-and-drop board. The app covers account signup and email verification,
password reset, team and epic management, ticket creation and editing, and a
board view for moving tickets between columns.

## Setup

1. Install dependencies: `npm install`.
2. Apply database migrations: `npm run db:migrate`.
3. Optionally seed a local development user: `npm run db:seed:dev`.
4. Start the development server: `npm run dev`.

## Scripts

- `npm run dev` starts the development server.
- `npm run typecheck` generates React Router types and runs TypeScript.
- `npm test` runs Vitest.
- `npm run build` builds the production app.
- `npm run start` runs the production build.
- `npm run db:migrate` applies Drizzle migrations.
- `npm run db:seed:dev` creates or refreshes a verified local-only manual QA user, `test@test.com` with password `test`. Run it only for local development databases after migrations.

## Branch cleanup

The `Cleanup merged branches` GitHub Actions workflow runs daily at 00:00 UTC and can also be started manually. It fetches remote branches, deletes branches whose remote tip is already merged into `main`, and skips `main`, configured keep branches, protected branches, and branches that are not merged.

Default keep patterns are `main`, `master`, `develop`, `development`, `staging`, `production`, `release/*`, and `gh-pages`. Manual runs can add more exact names or shell globs with the `keep_branches` input, and can use `dry_run` to list deletion candidates without deleting them.

## Docker Compose

Run the production build locally from a clean checkout:

```bash
docker compose up --build
```

The app is available at `http://localhost:3000`.

The container uses `DATABASE_URL=/data/local.db` by default and stores the SQLite database in the `app-data` Docker volume. Migrations run automatically before the server starts, so repeated `docker compose up --build` runs are safe.

Stop the app with:

```bash
docker compose down
```

Remove the local Docker database volume when you need a fresh container database:

```bash
docker compose down --volumes
```
