# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- PostgreSQL 16 service in Docker Compose (healthcheck, named volume, published on `127.0.0.1` only) and SQL schema in `db/init/01-schema.sql`: enums, `users` / `vacation_requests` with a cascading foreign key, check and overlap-exclusion constraints, indexes for the list/filter/team queries and a trigger that freezes approved requests. TypeORM entities mirror it.
- `db/init/02-seed.sql`: dev-only demo data (6 users, 12 vacation requests in all statuses) with bcrypt hashes from `pgcrypto`; the single source of seed data (the backend seeds nothing).
- `db/init/03-app-role.sh`: non-superuser `APP_DB_*` role with DML-only grants on the two tables; the backend connects as this role, the `POSTGRES_*` admin is for initialisation only.
- JWT authentication (`/auth/login`, `/auth/me`), global auth guard and role-based access control (Requester, Validator).
- Vacation request API: submit, edit/cancel (pending only), list own, list all with status/user filters and pagination, approve/reject (comment required to reject), team calendar, user list.
- Business rules: date order, no past dates, no overlaps per user, approved requests frozen, mandatory rejection comment; DB constraints back them up under concurrency.
- Lifecycle events (`travel.vacation-request.*`) published to the event bus.
- Vue Router on the frontend; the event test page now lives at `/events-test`.

- Test tooling: Jest (backend), Vitest + Vue Test Utils (frontend), Playwright e2e (desktop Chrome only) with API specs for auth, roles and business rules.

### Changed

- Frontend upgraded to Vite 8, `@vitejs/plugin-vue` 6, `vue-tsc` 3 and Vue Router 5 (v5's optional `vite` peer requires Vite 7+; no code changes were needed).

- Single-day vacation requests are now rejected: the end date must be strictly after the start date (API rule and `vacation_dates_ck`). Existing databases need `docker compose down -v` to pick up the stricter constraint.

- Less log noise: LocalStack runs with `DEBUG=0` / `LS_LOG=warn`, and the Docker image builds run `npm ci` and `npm run build` quietly.

### Fixed

- LocalStack bootstrap failed (and the consumer never started) when the event bus already existed from a previous run.

- NestJS backend with an in-process event publisher and SQS background worker.
- LocalStack provisioning on boot: EventBridge bus `travel-app-event-bus`, SQS queue `travel-app-event-queue`, and a catch-all rule routing to the queue (retries while LocalStack starts).
- AWS SDK clients (EventBridge, SQS) pinned to `AWS_ENDPOINT_URL` so no traffic reaches real AWS.
- Inbound SQS messages normalised with `commoneventframework` (`buildCommonEvent`).
- Vue 3 + Vite + TypeScript frontend test page ("Send event" button, live list of received events) styled with CSS Modules.
- Docker Compose stack: LocalStack, backend, and nginx-served frontend proxying `/api`.
- Per-service `.dockerignore`, root `.env.example` for compose variables.
