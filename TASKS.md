# TASKS

This document is the single source of truth for project work.

---

## Backlog

## Agent 1 In Progress

## Agent 2 In Progress

---

## Ready For Review

### Minimum Screen Placeholders

Owner: Agent 2
Branch: agent/2/minimum-screen-placeholders
Status: Ready For Review

Outcome:
Add placeholder routes and screen shells for the minimum product surface.

Scope:
- Add a sign-up screen placeholder with form fields and submit affordance.
- Add an email verification result screen placeholder covering success, invalid-token, and expired-token states.
- Add a verification-email resend action placeholder for unverified accounts and expired-token cases.
- Add a login screen placeholder with form fields and submit affordance.
- Add a Kanban board placeholder with team selector, columns, and placeholder ticket cards.
- Add ticket create, edit, and details placeholders.
- Add a team management screen placeholder with list and create/edit affordances.
- Add an epic management screen placeholder with list and create/edit affordances.
- Keep route loaders/actions thin and ready for later service integration.
- Add focused smoke coverage for the placeholder routes where practical.

Progress:
- Added placeholder routes for authentication, verification, board, tickets, teams, and epics.
- Added thin placeholder loaders/actions for later service integration.
- Added focused smoke tests for route rendering and placeholder loader/action boundaries.
- Verified with `npm test`, `npm run typecheck`, and `npm run build`.

Follow-up:
- Implement real account creation, verification, authentication, team, epic, ticket, and board workflows.

---

### Initial Project Setup

Owner: Agent 1
Branch: agent/1/initial-project-setup
Status: Ready For Review

Outcome:
Bootstrap the application as a minimal React Router framework-mode repo ready for frontend, backend, and persistence work.

Scope:
- Initialize the app with React Router framework mode using the standard React Router init flow.
- Keep the generated application minimal by removing unnecessary starter/demo files, assets, routes, and sample content.
- Add a simple placeholder frontend route that confirms the app renders.
- Add a minimal backend/service layer placeholder for server-side business logic.
- Add a minimal database layer placeholder using SQLite and Drizzle conventions.
- Configure TypeScript strict mode and expected project scripts for development, typecheck, tests, build, and database migration.
- Add focused smoke coverage for the placeholder app structure where practical.

Progress:
- Added a minimal React Router framework-mode application structure.
- Added placeholder service and SQLite/Drizzle database scaffolding.
- Added strict TypeScript, expected npm scripts, and smoke tests.

Follow-up:
- Replace placeholders with the first real product workflow.

---
