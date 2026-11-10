# Tours App

Vacation management app (see [ASSIGNMENT.md](ASSIGNMENT.md)). The backend API is complete (auth, roles, vacation requests, team planning, lifecycle events) and runs fully locally, without an AWS account. The requester/validator UIs are still to do; the frontend currently only has the event-pipeline test page.

## Stack

| Layer     | Tech                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Backend   | NestJS 11, TypeScript 5, TypeORM 1, JWT, `@aws-sdk/client-eventbridge` and `@aws-sdk/client-sqs` v3, `commoneventframework` 1 |
| Events    | Transactional outbox in Postgres, EventBridge bus, SQS queue                                                                  |
| Frontend  | Vue 3, Vue Router 5, Vite 8, TypeScript, Axios, CSS Modules                                                                   |
| Database  | PostgreSQL 16, schema/seed/role scripts in `db/init/`                                                                         |
| Local AWS | LocalStack 3.8 (`events`, `sqs`)                                                                                              |
| Runtime   | Docker Compose, nginx (serves frontend, proxies `/api`)                                                                       |
| Tests     | Jest 30 + ts-jest (backend), Vitest + Vue Test Utils (frontend), Playwright (e2e, desktop Chrome)                             |

## Architecture

How a command becomes an event and reaches its consumers:

1. HTTP command (e.g. `POST /api/vacation-requests/:id/approve`) → controller → service, which checks the business rules.
2. One database transaction writes the change (`vacation_requests`) and an `event_outbox` row.
3. `OutboxRelayService` polls unsent rows and sends them with `PutEvents` to the EventBridge bus `travel-app-event-bus`.
4. A catch-all rule forwards the raw EventBridge event to the SQS queue `travel-app-event-queue`.
5. `EventConsumerService` long-polls the queue → `EventRouter` adds `path: /events/<type>` → `commoneventframework` `buildCommonEvent` → route `PUT /events/<type>` → input parser (validates the envelope) → subscribers (notifications, dev log) → the message is deleted.

- `backend/src/aws` – AWS client providers, all forced to `AWS_ENDPOINT_URL`.
- `backend/src/localstack` – idempotent bus/queue/rule provisioning on boot, with retry/backoff.
- `backend/src/events` – the event contract (`event-types.ts`), envelope, publisher (sends to the bus), `outbox/` (record + relay), router and consumer, dev log and test endpoints.
- `backend/src/auth` – login, global JWT guard (`@Public()` opts out), role guard (`@Roles()`), `@CurrentUser()`, login events.
- `backend/src/users` – `User` entity, `GET /users` for the validator's user filter.
- `backend/src/vacation-requests` – entity, DTOs, business rules (`vacation-rules.ts`), service, lifecycle event recorder, expiry job, notifications subscriber, controllers.
- `backend/src/common` – pagination DTO/response, the `YYYY-MM-DD` validator and the per-request context (correlation id).
- `frontend/src` – `router/`, `views/` (page per route), components, `useReceivedEvents` composable, Axios API module.

**Note:** `commoneventframework` is a Lambda-side event normaliser and router; it does not publish. Publishing uses the AWS SDK directly (from the outbox relay), and the framework normalises and routes the consumed SQS messages, as it would inside a Lambda SQS trigger.

## Run

Everything runs in Docker:

```bash
cp .env.example .env && cp backend/.env.example backend/.env
docker compose up --build
```

The frontend is at http://localhost:8080 and the API at http://localhost:3000/api. The event pipeline check lives at http://localhost:8080/events-test (click **Send event**); it needs `ENABLE_TEST_ENDPOINTS=true`, which `backend/.env.example` sets. `/events` is intentionally unused so it stays free; the test page is only a dev tool.

Optional, without Docker for the apps: start the dependencies with `docker compose up -d postgres localstack`, then run `npm run start:dev` in `backend/` and `npm run dev` in `frontend/` (http://localhost:5173).

## Configuration

Two files: the root `.env` (read by Docker Compose, and by the backend through `../.env` when it runs outside Docker) and `backend/.env` (the backend's own settings). Both are copied from their `.env.example`.

| Variable                           | File           | Default                 | Purpose                                                                                          |
| ---------------------------------- | -------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `BACKEND_PORT`                     | `.env`         | `3000`                  | Host port of the API container                                                                   |
| `FRONTEND_PORT`                    | `.env`         | `8080`                  | Host port of the nginx frontend                                                                  |
| `LOCALSTACK_PORT`                  | `.env`         | `4566`                  | Host port of LocalStack                                                                          |
| `POSTGRES_HOST`                    | `.env`         | `localhost`             | Database host for a backend outside Docker (compose sets `postgres` in the container)            |
| `POSTGRES_PORT`                    | `.env`         | `5432`                  | Database port (published on `127.0.0.1` only)                                                    |
| `POSTGRES_USER`                    | `.env`         | required                | Admin (superuser) role, used only by the init scripts                                            |
| `POSTGRES_PASSWORD`                | `.env`         | required                | Its password                                                                                     |
| `POSTGRES_DB`                      | `.env`         | required                | Database name                                                                                    |
| `APP_DB_USER`                      | `.env`         | required                | Limited role the backend connects as (created by `03-app-role.sh`)                               |
| `APP_DB_PASSWORD`                  | `.env`         | required                | Its password                                                                                     |
| `PORT`                             | `backend/.env` | `3000`                  | Port the API listens on                                                                          |
| `AWS_ENDPOINT_URL`                 | `backend/.env` | required                | Endpoint every AWS client uses (LocalStack; compose sets `http://localstack:4566`)               |
| `AWS_REGION`                       | `backend/.env` | `eu-west-1`             | AWS region                                                                                       |
| `AWS_ACCESS_KEY_ID`                | `backend/.env` | `test`                  | Dummy credentials for LocalStack                                                                 |
| `AWS_SECRET_ACCESS_KEY`            | `backend/.env` | `test`                  | Dummy credentials for LocalStack                                                                 |
| `EVENT_BUS_NAME`                   | `backend/.env` | required                | EventBridge bus (`travel-app-event-bus`)                                                         |
| `EVENT_QUEUE_NAME`                 | `backend/.env` | required                | SQS queue (`travel-app-event-queue`)                                                             |
| `EVENT_RULE_NAME`                  | `backend/.env` | required                | Rule that forwards every event to the queue                                                      |
| `JWT_SECRET`                       | `backend/.env` | required                | Token signing secret; change it outside local development                                        |
| `JWT_EXPIRES_IN_SECONDS`           | `backend/.env` | `3600`                  | Token lifetime                                                                                   |
| `VACATION_EXPIRY_INTERVAL_SECONDS` | `backend/.env` | `600`                   | How often the expiry job runs; `0` disables it                                                   |
| `OUTBOX_POLL_INTERVAL_MS`          | `backend/.env` | `1000`                  | How often the relay publishes recorded events; `0` disables it                                   |
| `OUTBOX_RETENTION_DAYS`            | `backend/.env` | `7`                     | Published outbox rows older than this are purged                                                 |
| `ENABLE_TEST_ENDPOINTS`            | `backend/.env` | off (`true` in example) | Enables the unauthenticated `/api/test/*` endpoints behind `/events-test`; keep it off elsewhere |

## Testing

| Command (repo root) | What it runs                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run test:unit` | Backend Jest and frontend Vitest suites (`*.spec.ts` next to the code) |
| `npm run test:e2e`  | Playwright against the real stack (needs Postgres and LocalStack up)   |
| `npm test`          | Both of the above                                                      |

Per package: `npm test` in `backend/` (Jest) or `frontend/` (Vitest), plus `test:watch`. E2E setup:

```bash
docker compose up -d postgres localstack   # dependencies; the API and Vite dev server are started by Playwright
docker compose stop app                    # if the full stack is running: it shares the outbox table
npx playwright install chromium            # first time only
npm run test:e2e                           # or test:e2e:ui for the interactive runner
```

E2E runs in desktop Chrome only for now (`playwright.config.ts`). It always starts its own backend (`:3100`) and Vite (`:5273`) from the current source, with a dedicated event bus and queue (`e2e-*`), so it never reuses a stale server or shares events with the Docker stack or your dev servers (override with `E2E_API_PORT` / `E2E_WEB_PORT`). The Docker `app` container must not run at the same time: it uses the same database, so its outbox relay would claim e2e events and publish them to its own bus. Specs live in `e2e/tests`; API specs call `/api` through the Vite proxy, and event specs follow an event through the whole chain (outbox, relay, bus, queue, framework routing, subscriber) to the dev event log (`GET /api/test/events`). Requests use random dates far ahead, partitioned per worker; a global setup (`e2e/global-setup.ts`) first deletes requests starting 400+ days out that earlier runs left behind (seed data is untouched), so the suite can be re-run on the same database.

## Database

The schema is owned by SQL, not by TypeORM (`synchronize` is off). The scripts in `db/init/` run in order, once, when the Postgres volume is first created (reset with `docker compose down -v`):

| Script           | Purpose                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-schema.sql`  | Enums, `users` and `vacation_requests` (FK `user_id` → `users.id`, `ON DELETE CASCADE`), the `end_date > start_date` and rejection-comment checks, an exclusion constraint forbidding overlapping pending/approved requests per user, indexes, and a trigger freezing approved requests, plus `event_outbox` (events waiting to be published, and published ones until purged). |
| `02-seed.sql`    | Dev-only demo users and requests (dates relative to the init day). The only seed: the backend creates no data. Remove it for a real deployment.                                                                                                                                                                                                                                 |
| `03-app-role.sh` | Creates the limited `APP_DB_*` role (no superuser/DDL; DML on `users`, `vacation_requests` and `event_outbox`). A shell script because the role name and password come from the environment.                                                                                                                                                                                    |

The API validates the same rules first for friendly errors; the database is the safety net under concurrency. Rules that depend on today's date ("no past requests") live in the API only.

`POSTGRES_*` is the admin (initialisation only), `APP_DB_*` the limited role the backend connects as; see [Configuration](#configuration). A new table must be added to the grant in `03-app-role.sh` (there are no default privileges).

## Demo accounts

Seeded by `db/init/02-seed.sql` on first database start. Password for all: `Password123!`

| Email              | Role      |
| ------------------ | --------- |
| alice@example.com  | Requester |
| bob@example.com    | Requester |
| dave@example.com   | Requester |
| erin@example.com   | Requester |
| carol@example.com  | Validator |
| victor@example.com | Validator |

## API

Prefix `/api`. Everything except login needs `Authorization: Bearer <token>`. Errors use Nest's `{ statusCode, message, error }`; validation failures list every problem in `message`.

| Method & path                         | Role      | Purpose                                                            |
| ------------------------------------- | --------- | ------------------------------------------------------------------ |
| `POST /auth/login`                    | public    | `{ email, password }` -> `{ accessToken, user }`                   |
| `GET /auth/me`                        | any       | Current user                                                       |
| `POST /vacation-requests`             | Requester | Submit `{ startDate, endDate, reason? }`                           |
| `GET /vacation-requests/me`           | Requester | Own requests, `?status&page&limit`                                 |
| `PATCH /vacation-requests/:id`        | Requester | Edit own **pending** request                                       |
| `DELETE /vacation-requests/:id`       | Requester | Cancel own **pending** request (204)                               |
| `GET /vacation-requests`              | Validator | All requests, `?status&userId&page&limit`                          |
| `POST /vacation-requests/:id/approve` | Validator | Approve, optional `{ comment }`                                    |
| `POST /vacation-requests/:id/reject`  | Validator | Reject, `{ comment }` **required**                                 |
| `GET /vacation-requests/:id`          | any       | One request (requesters: own only, else 404)                       |
| `GET /team/vacations`                 | any       | Approved vacations in `?from&to` (default: this month), no reasons |
| `GET /users`                          | Validator | Users for the filter dropdown, `?role`                             |

Lists return `{ items, meta: { page, limit, total, totalPages } }` (`limit` default 10, max 100), newest first.

Status codes: 400 validation or date rule, 401 no/invalid token, 403 wrong role, 404 missing (or not yours), 409 conflict (overlap, request already decided or frozen).

Business actions and logins raise events; see [Events](#events).

## Events

Commands (submit, edit, cancel, approve, reject, log in) are the HTTP endpoints; events are the facts they leave behind, delivered through EventBridge and SQS.

| Event type                          | Raised when                                                  | `data` (besides `requestId`, `userId`, `startDate`, `endDate`, `status`)          |
| ----------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `travel.vacation-request.submitted` | A requester submits a request                                |                                                                                   |
| `travel.vacation-request.updated`   | A pending request is edited                                  | `changes` (`startDate`/`endDate` `{from,to}`, only what changed), `reasonChanged` |
| `travel.vacation-request.cancelled` | A pending request is cancelled                               |                                                                                   |
| `travel.vacation-request.approved`  | A validator approves                                         | `decidedAt`, `comment`                                                            |
| `travel.vacation-request.rejected`  | A validator rejects                                          | `decidedAt`, `comment` (required)                                                 |
| `travel.vacation-request.expired`   | A request is still Pending after its start date (system job) | `expiredAt`                                                                       |
| `travel.auth.login-succeeded`       | Successful login                                             | `userId`, `role`, `ip`                                                            |
| `travel.auth.login-failed`          | Failed login                                                 | `email` (lower-cased), `reason` (`unknown-email` / `wrong-password`), `ip`        |

The contract (type names and the exact payload of each) is typed in `backend/src/events/event-types.ts`. Every event shares one envelope (`event-envelope.ts`):

```json
{
  "eventId": "uuid",
  "schemaVersion": 1,
  "occurredAt": "2026-11-10T14:52:15.457Z",
  "source": "travel-app.api",
  "type": "travel.vacation-request.approved",
  "correlationId": "the request's X-Request-Id",
  "actor": { "type": "user", "id": "uuid", "role": "Validator" },
  "data": {}
}
```

- **`correlationId`** is the caller's `X-Request-Id` header when valid, otherwise a generated UUID; it is echoed on the response. Every event caused by one request (or one expiry job run) shares it.
- **`actor`** is `user` (id and role), `system` (background job) or `anonymous` (failed login).
- **Payloads carry ids and a small snapshot only**, never names, emails of requesters, the free-text reason or passwords. Consumers look up the rest by `requestId`/`userId`.

### Delivery guarantees

- **Transactional outbox.** A service never publishes: it writes the event into `event_outbox` _in the same database transaction_ as the change, so the event exists if and only if the change committed (if recording fails, the request fails and rolls back). The `OutboxRelayService` polls the table (`OUTBOX_POLL_INTERVAL_MS`, default 1000), claims rows with `FOR UPDATE SKIP LOCKED` (several API instances are fine), publishes them oldest first and marks them published. A crash, a restart or a bus outage therefore cannot lose an event: unsent rows are simply sent later. On graceful shutdown the relay flushes what is pending.
- **At-least-once.** A crash between sending and marking resends the event with the same `eventId`; SQS may also redeliver. Subscribers de-duplicate on `eventId` (the dev log skips ids it has seen).
- **Bad events don't block the rest.** If the bus is unreachable the relay stops and retries on the next poll. If the bus _rejects_ a specific event, only that row is counted against (`attempts`, `last_error`) and after 5 rejections it is parked (left unsent and logged as an error) so the rows behind it still flow.
- **Consumer failures.** A message is deleted once every subscriber handled it. If a subscriber fails, the message stays on the queue and SQS redelivers it. A malformed message would never succeed, so it is logged at error level and deleted.
- **Login events** go through the same outbox. A login changes no business data, so if recording one fails it is logged and the login still answers normally.
- **Expiry job** (`vacation-request.expired`) runs at startup and every `VACATION_EXPIRY_INTERVAL_SECONDS` (default 600, `0` disables). The claim (one atomic `UPDATE ... RETURNING` that sets `expired_at`) and the outbox row are written in one transaction, so the two cannot diverge and instances never raise the event twice. The status stays `Pending` (a validator can still decide it); editing the period clears the marker, so a re-dated request can expire again.

### Consuming and routing: how `commoneventframework` is used

`commoneventframework` normalises each SQS message into a CommonEvent and routes it. This version derives the route of an SQS message from a `path` field **in the message body** (its README's `/sqs/{queueName}` is not what the code does), and EventBridge puts none there. The rule forwards the raw EventBridge event to the queue, and the consumer adapter (`event-router.service.ts`) sets `path` to `/events/<detail-type>` before handing the message over. On AWS an input transformer on the rule target could do this instead, but LocalStack cannot apply one (3.8 crashes on the object placeholder; the v2 events provider delivers nothing), and switching to one means removing the adapter in the same change. Every event type with a subscriber becomes a route, `PUT /events/<type>`, whose input parser validates the envelope and whose handler fans it out to the subscribers of that type. A message with no route, or an invalid envelope, is malformed: it is logged and deleted. A failing subscriber leaves the message on the queue for redelivery, and a valid event nobody subscribed to is acknowledged with a warning.

Modules join by subscribing (`EventRouter.subscribe({ name, types, handle })`) to the event types they care about; adding a consumer means adding a subscriber, not touching the pipeline. There are two:

- **Notifications** (`vacation-requests/notifications.subscriber.ts`) reacts to `approved`, `rejected` and `expired` and logs the message it would send the requester, e.g. `Would notify user <id>: your request <id> was approved`. It stands in for an email or push sender.
- **Dev log** (`events/dev-event-log.subscriber.ts`) keeps the last 200 events in memory for `/events-test` (dev only).

### Logs and dev endpoints

- **Logs** show one line per event, without payloads: `Published travel.x id=3f2a9c1e correlation=7b1d0e44 actor=user:00000000(Validator)` and the matching `Received ...`. The framework's own debug output is muted.
- `GET /api/test/events` and `POST /api/test/publish` (behind the `/events-test` page) are unauthenticated and expose event payloads, so they exist only when `ENABLE_TEST_ENDPOINTS=true` (set in `backend/.env.example` for local development); otherwise they answer 404.

## Technical decisions

- **Single-day vacations are rejected.** The assignment says "end date must be after start date", so `end > start` is enforced strictly, both in the API (`vacation-rules.ts`, HTTP 400) and in the schema (`vacation_dates_ck`). A one-day absence cannot be requested; the earliest valid request is two consecutive dates. Overlap checks stay inclusive of both end dates, so back-to-back requests that share a day are still overlaps.
- **"Past" means before today in UTC**; starting today is allowed.
- **Approved and rejected requests are final.** Only pending requests can be edited or cancelled; a rejected request is replaced by submitting a new one (rejected dates no longer block overlaps).
- **Decisions are atomic compare-and-set** (`UPDATE ... WHERE status = 'Pending'`), so two validators cannot both decide one request.
- **Validators don't submit requests**; requesters don't see other people's requests (404, not 403, to avoid leaking existence).
- **Team calendar shows approved vacations only**, and never reasons or comments.

## Known limitations

- The dev event log (`/events-test`, `/api/test/events`) keeps the last 200 events in memory and is lost on restart.
- The outbox relay polls (default every second), so events lag the change slightly. Published rows are purged after `OUTBOX_RETENTION_DAYS` (default 7). Rows the bus rejects five times are parked and need manual attention (`attempts >= 5` in `event_outbox`); nothing alerts on them.
- Malformed queue messages are logged and dropped: there is no dead-letter queue in the local setup.
- Delivery order is not guaranteed (several relay instances, a standard SQS queue); consumers should not assume strict ordering.
- Notifications are only logged; no email or push is sent.
- A request that expired (start date passed while Pending) can still be approved or rejected; only the event is sent.
- The login events carry the client IP as seen by the API; behind nginx/a proxy that is the proxy's address unless `trust proxy` is configured.
- The requester and validator UIs (login, store, request forms, dashboard, team view) are not built yet.
- No login rate limiting, refresh tokens or token revocation; tokens last `JWT_EXPIRES_IN_SECONDS` (default 1h).
- `/api/test/*` is unauthenticated on purpose (dev-only test page) and is off unless `ENABLE_TEST_ENDPOINTS=true`.
- Test coverage: backend logic is unit-tested (service rules, guards, DTO validation, pagination, events) and the whole API is covered by Playwright API specs (auth, roles, vacation lifecycle, team calendar, users, events). No UI e2e until the pages exist.
