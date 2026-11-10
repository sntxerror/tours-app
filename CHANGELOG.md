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

- Events: `travel.vacation-request.expired` (system job, once per request), `travel.auth.login-succeeded` and `travel.auth.login-failed`.
- Event envelope: `schemaVersion`, `correlationId` (from `X-Request-Id`, echoed on responses) and a typed `actor`; `updated` carries the changed dates, `approved`/`rejected` carry `decidedAt` and the comment.
- Unit tests for the envelope, publishers, expiry job, login events and logging; e2e specs for every lifecycle and login event.
- More test coverage: unit tests for `VacationRequestsService` (create, update, cancel, decisions, races, listing, team calendar), the JWT and roles guards, `UsersService`, pagination, the calendar-date validator, the request DTOs and the received-events store; API e2e specs for the vacation request lifecycle (validation, ownership, filters, pagination, decisions), the team calendar, the user list and extra auth cases.

- Transactional outbox (`event_outbox`): events are written in the same transaction as the change and published by a relay (`FOR UPDATE SKIP LOCKED`, at-least-once, parks events the bus rejects, graceful flush on shutdown, purge of published rows). Login events use it too.
- Dead-letter queue (`<queue>-dlq`) with a redrive policy and explicit visibility timeout (`EVENT_MAX_RECEIVE_COUNT`, `EVENT_VISIBILITY_TIMEOUT_SECONDS`, `EVENT_DLQ_NAME`).
- Event routing through `commoneventframework` (`EventRouter`, route `PUT /events/<type>`) with a subscriber API; consumers are idempotent.
- Audit trail: `audit_log` (append-only, keyed by event id) filled by an event subscriber, and `GET /api/audit-log` for validators (`type`, `correlationId`, `requestId` filters, pagination).
- Typed event contract (`events/event-types.ts`) used by the publishers and consumers.
- Tests: unit specs for the outbox, relay, router, consumer, queue provisioning, audit trail and guards; e2e specs that follow events through the whole chain and the audit endpoint.

### Changed

- **Breaking for existing databases:** new tables `event_outbox` and `audit_log` and a new grant set (`docker compose down -v`).
- The `/api/test/*` dev endpoints are disabled unless `ENABLE_TEST_ENDPOINTS=true` (they exposed event payloads without authentication). Add the variable to your `backend/.env` for the `/events-test` page (it is in `backend/.env.example`).
- Services no longer publish events directly or best-effort; a failure to record an event now fails (and rolls back) the request, which is what makes the events reliable.
- Editing a request's period clears its expiry marker so it can expire again.
- E2E date ranges are drawn from a much larger window: with the old one, repeated runs against the same database started to collide.

- Event logs are one clean line per event (no payload dump) and `commoneventframework` debug output is muted.
- Playwright starts its own backend/Vite on separate ports with a dedicated event bus and queue instead of reusing running servers.
- Events published while LocalStack is still provisioning the bus now wait for it instead of failing.
- `vacation_requests.expired_at` column (existing databases need `docker compose down -v`).

- Frontend upgraded to Vite 8, `@vitejs/plugin-vue` 6, `vue-tsc` 3 and Vue Router 5 (v5's optional `vite` peer requires Vite 7+; no code changes were needed).

- Single-day vacation requests are now rejected: the end date must be strictly after the start date (API rule and `vacation_dates_ck`). Existing databases need `docker compose down -v` to pick up the stricter constraint.

- Less log noise: LocalStack runs with `DEBUG=0` / `LS_LOG=warn`, and the Docker image builds run `npm ci` and `npm run build` quietly.

- Backend `tsconfig.json` works with TypeScript 6 (what editors pick up from the root `node_modules`): explicit `rootDir` and `types` (`jest`, `node`), unused `baseUrl` removed. Behaviour with TypeScript 5 is unchanged.

### Fixed

- LocalStack bootstrap failed (and the consumer never started) when the event bus already existed from a previous run.

- NestJS backend with an in-process event publisher and SQS background worker.
- LocalStack provisioning on boot: EventBridge bus `travel-app-event-bus`, SQS queue `travel-app-event-queue`, and a catch-all rule routing to the queue (retries while LocalStack starts).
- AWS SDK clients (EventBridge, SQS) pinned to `AWS_ENDPOINT_URL` so no traffic reaches real AWS.
- Inbound SQS messages normalised with `commoneventframework` (`buildCommonEvent`).
- Vue 3 + Vite + TypeScript frontend test page ("Send event" button, live list of received events) styled with CSS Modules.
- Docker Compose stack: LocalStack, backend, and nginx-served frontend proxying `/api`.
- Per-service `.dockerignore`, root `.env.example` for compose variables.
