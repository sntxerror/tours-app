# Tours App

Vacation management app (see [ASSIGNMENT.md](ASSIGNMENT.md)). Current state: an event-driven plumbing prototype that runs fully locally, without an AWS account.

## Stack

| Layer     | Tech                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------- |
| Backend   | NestJS 11, TypeScript, `@aws-sdk/client-eventbridge`, `@aws-sdk/client-sqs`, `commoneventframework` |
| Frontend  | Vue 3, Vite, TypeScript, Axios, CSS Modules                                                         |
| Local AWS | LocalStack 3.8 (`events`, `sqs`, `sns`)                                                             |
| Runtime   | Docker Compose, nginx (serves frontend, proxies `/api`)                                             |

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
- `frontend/src` – `App.vue`, components, `useReceivedEvents` composable, Axios API module.

**Note:** `commoneventframework` is a Lambda-side event normaliser; it does not publish. Publishing uses the AWS SDK directly, and the framework is applied to consumed SQS messages.

## Run

```bash
cp .env.example .env && cp backend/.env.example backend/.env
docker compose up --build
```

Open http://localhost:8080 and click **Send event**.

Without Docker for the apps: start LocalStack (`docker compose up localstack`), then `npm run start:dev` in `backend/` and `npm run dev` in `frontend/` (http://localhost:5173).

## Known limitations

- Received events are kept in memory (last 50); lost on restart.
- Library debug logging from `buildCommonEvent` is not suppressed.
- Auth, PostgreSQL/TypeORM and the vacation features from the assignment are not implemented yet.
