# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- NestJS backend with an in-process event publisher and SQS background worker.
- LocalStack provisioning on boot: EventBridge bus `travel-app-event-bus`, SQS queue `travel-app-event-queue`, and a catch-all rule routing to the queue (retries while LocalStack starts).
- AWS SDK clients (EventBridge, SQS) pinned to `AWS_ENDPOINT_URL` so no traffic reaches real AWS.
- Inbound SQS messages normalised with `commoneventframework` (`buildCommonEvent`).
- Vue 3 + Vite + TypeScript frontend test page ("Send event" button, live list of received events) styled with CSS Modules.
- Docker Compose stack: LocalStack, backend, and nginx-served frontend proxying `/api`.
- Per-service `.dockerignore`, root `.env.example` for compose variables.
