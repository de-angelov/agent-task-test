# Minimal React Router App

This repository is bootstrapped as a minimal React Router framework-mode application with placeholders for frontend rendering, server-side services, and SQLite persistence through Drizzle.

## Scripts

- `npm run dev` starts the development server.
- `npm run typecheck` generates React Router types and runs TypeScript.
- `npm test` runs Vitest.
- `npm run build` builds the production app.
- `npm run db:migrate` applies Drizzle migrations.

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
