# Tours App

Vacation management app (see [ASSIGNMENT.md](ASSIGNMENT.md)). The backend API is complete (auth, roles, vacation requests, team planning, lifecycle events) and runs fully locally, without an AWS account. The requester/validator UIs are still to do; the frontend currently only has the event-pipeline test page.

## Stack

| Layer     | Tech                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Backend   | NestJS 11, TypeScript, TypeORM, PostgreSQL, JWT, `@aws-sdk/client-eventbridge`, `@aws-sdk/client-sqs`, `commoneventframework` |
| Frontend  | Vue 3, Vue Router 5, Vite 8, TypeScript, Axios, CSS Modules                                                                   |
| Database  | PostgreSQL 16, schema/seed/role scripts in `db/init/`                                                                         |
| Local AWS | LocalStack 3.8 (`events`, `sqs`, `sns`)                                                                                       |
| Runtime   | Docker Compose, nginx (serves frontend, proxies `/api`)                                                                       |
| Tests     | Jest + ts-jest (backend), Vitest + Vue Test Utils (frontend), Playwright (e2e, desktop Chrome)                                |

## Architecture

```
Browser ──► nginx / Vite proxy ──► NestJS  POST /api/test/publish
                                      │ EventPublisherService (PutEvents)
                                      ▼
                         EventBridge bus "travel-app-event-bus"
                                      │ rule: match all events
                                      ▼
                         SQS "travel-app-event-queue"
                                      │ long-poll
                                      ▼
                  EventConsumerService (same process) ──► delete message
                    └─ buildCommonEvent() → ReceivedEventsStore
                                      ▲
Browser ◄── GET /api/test/events ─────┘
```

- `backend/src/aws` – AWS client providers, all forced to `AWS_ENDPOINT_URL`.
- `backend/src/localstack` – idempotent bus/queue/rule provisioning on boot, with retry/backoff.
- `backend/src/events` – publisher, background consumer, in-memory store, test controller.
- `backend/src/auth` – login, global JWT guard (`@Public()` opts out), role guard (`@Roles()`), `@CurrentUser()`.
- `backend/src/users` – `User` entity, `GET /users` for the validator's user filter.
- `backend/src/vacation-requests` – entity, DTOs, business rules (`vacation-rules.ts`), service, lifecycle events publisher, controllers.
- `backend/src/common` – pagination DTO/response and the `YYYY-MM-DD` validator.
- `frontend/src` – `router/`, `views/` (page per route), components, `useReceivedEvents` composable, Axios API module.

**Note:** `commoneventframework` is a Lambda-side event normaliser; it does not publish. Publishing uses the AWS SDK directly, and the framework is applied to consumed SQS messages.

## Run

```bash
cp .env.example .env && cp backend/.env.example backend/.env
docker compose up --build
```

The frontend is at http://localhost:8080. The event pipeline check lives at http://localhost:8080/events-test (click **Send event**). `/events` is intentionally unused so it stays free; the test page is only a dev tool.

Without Docker for the apps: start LocalStack (`docker compose up localstack`), then `npm run start:dev` in `backend/` and `npm run dev` in `frontend/` (http://localhost:5173).

## Testing

| Command (repo root) | What it runs                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `npm run test:unit` | Backend Jest and frontend Vitest suites (`*.spec.ts` next to the code) |
| `npm run test:e2e`  | Playwright against the real stack (needs Postgres and LocalStack up)   |
| `npm test`          | Both of the above                                                      |

Per package: `npm test` in `backend/` (Jest) or `frontend/` (Vitest), plus `test:watch`. E2E setup:

```bash
docker compose up -d postgres localstack   # dependencies; the API and Vite dev server are started by Playwright
npx playwright install chromium            # first time only
npm run test:e2e                           # or test:e2e:ui for the interactive runner
```

E2E runs in desktop Chrome only for now (`playwright.config.ts`). It always starts its own backend (`:3100`) and Vite (`:5273`) from the current source, with a dedicated event bus and queue (`e2e-*`), so it never reuses a stale server or shares events with the Docker stack or your dev servers (override with `E2E_API_PORT` / `E2E_WEB_PORT`). Specs live in `e2e/tests`; API specs call `/api` through the Vite proxy, and event specs read what the queue consumer received from `/api/test/events`. Requests use random far-future dates, so they can be re-run on the same database without overlaps (approved requests cannot be deleted).

## Database

The schema is owned by SQL, not by TypeORM (`synchronize` is off). The scripts in `db/init/` run in order, once, when the Postgres volume is first created (reset with `docker compose down -v`):

| Script           | Purpose                                                                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-schema.sql`  | Enums, `users` and `vacation_requests` (FK `user_id` → `users.id`, `ON DELETE CASCADE`), the `end_date > start_date` and rejection-comment checks, an exclusion constraint forbidding overlapping pending/approved requests per user, indexes, and a trigger freezing approved requests. |
| `02-seed.sql`    | Dev-only demo users and requests (dates relative to the init day). The only seed: the backend creates no data. Remove it for a real deployment.                                                                                                                                          |
| `03-app-role.sh` | Creates the limited `APP_DB_*` role (no superuser/DDL, DML on the two tables only).                                                                                                                                                                                                      |

The API validates the same rules first for friendly errors; the database is the safety net under concurrency. Rules that depend on today's date ("no past requests") live in the API only.

Configuration uses the root `.env`: `POSTGRES_*` is the admin (initialisation only), `APP_DB_*` is the limited role the backend connects as. Postgres is published on `127.0.0.1` only; the backend reads `../.env` when run outside Docker. `JWT_SECRET` lives in `backend/.env`.

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

Business actions and logins publish events to the bus; see [Events](#events).

## Events

Commands (submit, edit, cancel, approve, reject, log in) are the HTTP endpoints; events are the facts announced **after** the database change is committed, published to EventBridge and routed to SQS.

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

Every event shares one envelope (`backend/src/events/event-envelope.ts`):

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
- **Delivery.** Lifecycle and login events are best-effort: a bus outage is logged and never fails the user's request. The expiry event is stricter: a request is marked expired (`expired_at`) only together with a successful publish, and the claim is released on failure so the next run retries. Its status stays `Pending`, so a validator can still decide it.
- **Expiry job** runs at startup and every `VACATION_EXPIRY_INTERVAL_SECONDS` (default 600, `0` disables). It is safe with several API instances: the claim is one atomic `UPDATE ... RETURNING`.
- **Routing.** `commoneventframework` routes an SQS message by queue (`PUT /sqs/{queueName}`), not by event type. A real deployment would use one queue per consumer concern (notifications, calendar, audit) with an EventBridge rule filtering on `detail-type`, and switch on `type` inside each handler.
- **Logs** show one line per event, without payloads: `Published travel.x id=3f2a9c1e correlation=7b1d0e44 actor=user:00000000(Validator)` and the matching `Received ...`.

## Technical decisions

- **Single-day vacations are rejected.** The assignment says "end date must be after start date", so `end > start` is enforced strictly, both in the API (`vacation-rules.ts`, HTTP 400) and in the schema (`vacation_dates_ck`). A one-day absence cannot be requested; the earliest valid request is two consecutive dates. Overlap checks stay inclusive of both end dates, so back-to-back requests that share a day are still overlaps.
- **"Past" means before today in UTC**; starting today is allowed.
- **Approved and rejected requests are final.** Only pending requests can be edited or cancelled; a rejected request is replaced by submitting a new one (rejected dates no longer block overlaps).
- **Decisions are atomic compare-and-set** (`UPDATE ... WHERE status = 'Pending'`), so two validators cannot both decide one request.
- **Validators don't submit requests**; requesters don't see other people's requests (404, not 403, to avoid leaking existence).
- **Team calendar shows approved vacations only**, and never reasons or comments.

## Known limitations

- Received events are kept in memory (last 50); lost on restart.
- Events are published after the database commit, not in the same transaction: a crash in between loses the announcement (the lifecycle events; the expiry event is retried). A transactional outbox would close the gap.
- A request that expired (start date passed while Pending) can still be approved or rejected; only the event is sent.
- The login events carry the client IP as seen by the API; behind nginx/a proxy that is the proxy's address unless `trust proxy` is configured.
- The requester and validator UIs (login, Vuex store, request forms, dashboard, team view) are not built yet.
- No login rate limiting, refresh tokens or token revocation; tokens last `JWT_EXPIRES_IN_SECONDS` (default 1h).
- `/api/test/*` is unauthenticated on purpose (dev-only test page) and should be removed or protected for production.
- Test coverage is a starting point: business-date rules (unit) and auth, roles and vacation rules (API e2e). No UI e2e until the pages exist.
