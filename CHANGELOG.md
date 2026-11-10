# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Schema and seed changes only apply to a fresh database volume: run `docker compose down -v` after pulling.

### Added

- NestJS backend with an SQS background worker and event publishing to EventBridge.
- LocalStack provisioning on boot: EventBridge bus `travel-app-event-bus`, SQS queue `travel-app-event-queue` and a catch-all rule routing to the queue (retries while LocalStack starts).
- AWS SDK clients (EventBridge, SQS) pinned to `AWS_ENDPOINT_URL`, so no traffic reaches real AWS.
- Inbound SQS messages normalised with `commoneventframework` (`buildCommonEvent`).
- Vue 3 + Vite + TypeScript frontend with Vue Router; the event test page ("Send event" button, live list of received events, CSS Modules) lives at `/events-test`.
- Docker Compose stack (LocalStack, Postgres, backend, nginx-served frontend proxying `/api`), per-service `.dockerignore` and `.env.example` files.
- PostgreSQL 16 schema in `db/init/01-schema.sql`: enums, `users` / `vacation_requests` with a cascading foreign key, check and overlap-exclusion constraints, indexes for the list/filter/team queries and a trigger that freezes approved requests.
- `db/init/02-seed.sql`: dev-only demo data (6 users, 12 vacation requests in all statuses) with bcrypt hashes from `pgcrypto`; the backend seeds nothing.
- `db/init/03-app-role.sh`: non-superuser `APP_DB_*` role with DML-only grants; the backend connects as this role, the `POSTGRES_*` admin is for initialisation only.
- JWT authentication (`/auth/login`, `/auth/me`), a global auth guard and role-based access control (Requester, Validator).
- Vacation request API: submit, edit/cancel (pending only), list own, list all with status/user filters and pagination, approve/reject, team calendar, user list.
- Business rules: date order, no past dates, no overlaps per user, approved requests frozen, mandatory rejection comment; database constraints back them up under concurrency.
- Lifecycle events (`travel.vacation-request.submitted`, `updated`, `cancelled`, `approved`, `rejected`, `expired`) and login events (`travel.auth.login-succeeded`, `login-failed`), typed in `events/event-types.ts`.
- Event envelope with `schemaVersion`, `correlationId` (from `X-Request-Id`, echoed on responses) and a typed `actor`.
- `vacation_requests.expired_at` and a job that raises `expired` once for requests still pending after their start date.
- Transactional outbox (`event_outbox`): events are written in the same transaction as the change and published by a relay (`FOR UPDATE SKIP LOCKED`, at-least-once, parks events the bus rejects, flushes on shutdown, purges published rows).
- Event routing through `commoneventframework`: one `PUT /events/<type>` route per subscribed type, an input parser that validates the envelope, and a small subscriber API. A notifications subscriber logs what it would tell requesters about approved, rejected and expired requests.
- `ENABLE_TEST_ENDPOINTS` guard for the unauthenticated `/api/test/*` endpoints.
- Vue frontend: login with role-based route guards, requester page (request form, own list with status filter and pagination, edit and cancel of pending requests), validator dashboard (status and user filters kept in the URL, pagination, approve, reject with a required comment) and a monthly team calendar; Vuex 4 store with namespaced modules, a single Axios client that attaches the JWT and logs out on 401, reusable components and CSS Modules.
- Test tooling and coverage: Jest unit specs for the services, rules, guards, DTOs, events, outbox, router and consumer; Vitest + Vue Test Utils for the frontend; Playwright API specs for auth, roles, business rules, the request lifecycle, the team calendar, users and every event.

### Changed

- Event logs are one clean line per event (no payload dump), and `commoneventframework` debug output is muted.
- Playwright starts its own backend and Vite dev server on separate ports with a dedicated event bus and queue, and partitions e2e date ranges per worker.
- Frontend upgraded to Vite 8, `@vitejs/plugin-vue` 6, `vue-tsc` 3 and Vue Router 5.
- Single-day vacation requests are rejected: the end date must be strictly after the start date (API rule and `vacation_dates_ck`).
- Less log noise: LocalStack runs with `DEBUG=0` / `LS_LOG=warn`, and the Docker image builds run quietly.
- Backend `tsconfig.json` works with TypeScript 6 (explicit `rootDir` and `types`).
- Events go through the outbox instead of being published best-effort after the commit; a failure to record an event fails and rolls back the request.
- `/api/test/*` is disabled unless `ENABLE_TEST_ENDPOINTS=true` (set in `backend/.env.example` for local development).
- LocalStack runs only `events` and `sqs`.

### Removed

- Unused backend dev dependencies (`supertest`, `@types/supertest`, `@nestjs/testing`).

### Fixed

- LocalStack bootstrap failed (and the consumer never started) when the event bus already existed from a previous run.
- The validator's user filter answered 400 for every seeded user: their ids were not RFC 4122 UUIDs.
- Postgres logged a permission error on every backend start because TypeORM tried to install `uuid-ossp` as the limited role.
