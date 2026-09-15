# Current State

## Stage

MVP delivery path verified locally end to end.

## Completed work

- Added npm workspaces for the Fastify API, Vite/React dashboard, domain types, PostgreSQL access, and GitHub skeleton.
- Added Docker Compose PostgreSQL, a migration runner, `.env.example`, and a reserved future runner directory.
- Added API liveness (`GET /health`) and PostgreSQL readiness (`GET /health/database`) endpoints plus a dashboard shell.
- Added migrations for repositories, builds, ordered build steps, deployments, services, and structured logs, with PostgreSQL enums, foreign keys, timestamps, constraints, and query indexes.
- Added an idempotent development seed and `npm run db:seed`.
- Added typed read-only API endpoints for repositories, builds, build steps, deployments, services, and logs.
- Added a React operations dashboard with loading/error states and seeded-data views.
- Added GitHub configuration from environment variables, HMAC SHA-256 webhook verification, configured-repository filtering, and push-event parsing.
- Added repository registration (`POST /api/repositories`) and webhook ingestion (`POST /api/github/webhooks`), which records queued builds with GitHub delivery IDs for idempotency.
- Added webhook-delivery persistence and build commit-message migration support.
- Added an atomic queued-build claim, persisted clone/install/test step transitions, bounded structured step logs, and overall build completion status.
- Added a Docker-isolated runner that clones/checks out the requested commit and runs `npm install` and `npm test` in one short-lived, unmounted container. `POST /api/executor/run-once` executes at most one queued build.
- Protected repository registration and executor triggering with `API_AUTH_TOKEN` bearer authentication; signed GitHub webhooks remain authenticated by their HMAC signature.
- Added ten-minute wall-clock command timeouts, a named execution-runner boundary for a future Docker-isolated runner, and persisted retry counts. Failed builds receive one retry (two attempts total).
- Added the constrained `idp-build-runner:local` image (Node.js and Git), with no host workspace mounts, dropped capabilities, `no-new-privileges`, and bounded memory/CPU/process limits.
- Added Debian `ca-certificates` to the runner image so Git can verify HTTPS repository certificates without disabling SSL verification.
- Added an image step after tests that streams the isolated repository context directly to Docker, builds a generated npm-only image, tags it as `idp/<repository>:<commit-sha>`, captures output in structured logs, and persists `builds.image_reference`. The Dockerfile copies workspace manifests before `npm install` so the deployed workspace has all runtime dependencies.
- Added local Docker deployment and HTTP `/health` checks as persisted `deploy` and `health_check` steps. Deployments publish an ephemeral localhost port and services retain container, health URL, and health state.
- Added a fifteen-minute database lease so expired running builds are recoverable after a crash. Deployment or health failure uses the existing one-retry policy.
- Added authenticated retry/redeploy and build-status API endpoints; the dashboard displays image references, deployments, service health URLs, logs, steps, and actions.

## Current structure

- `apps/api`: Fastify API.
- `apps/web`: React/Vite dashboard shell.
- `packages/domain`, `packages/db`, `packages/github`: shared domain, PostgreSQL, and GitHub-boundary packages.
- `docker/runner`: Docker build-execution image; repository workspace stays inside a short-lived container behind the domain execution boundary.
- The image-build context is streamed from the runner container; no repository workspace is copied to the API host.

## Work in progress

None.

## Next step

Use a repository with an `npm start` service exposing `GET /health` on port 3000.

## Known limitations

- The deployment convention is intentionally minimal: an npm service must listen on container port 3000 and return a 2xx response from `/health`.
- GitHub status/check reporting is deferred because the existing GitHub boundary only handles webhook verification and has no GitHub API credential/client configuration.

## Verified checks

- `npm install` completed with no reported vulnerabilities.
- Root `npm test` builds the workspaces and runs their existing API, domain, and GitHub tests, matching the local executor's npm-only contract.
- `npm run typecheck` passed.
- `npm run build` passed for all workspaces.
- API `GET /health` returned HTTP 200 and `{"status":"ok",...}`.
- Dashboard development server returned its page successfully.
- API `GET /health/database` returned the expected HTTP 503 while PostgreSQL was unavailable.
- The Milestone 2 schema/foreign-key/constraint/index definitions were statically reviewed; `npm run typecheck` and `npm run build` passed after adding migration and seed tooling.
- The Milestone 3 API routes were registered through Fastify's in-process request facility; without `DATABASE_URL`, they correctly reached their database dependency rather than returning 404. Seeded-data responses remain unverified without PostgreSQL.
- GitHub and API webhook tests passed for valid and invalid signatures, duplicate delivery handling, and queued-build payload creation. PostgreSQL migration and transactional idempotency remain unverified because Docker daemon access was denied.
- Executor unit tests passed for successful state transitions, command failure, and thrown runner failure.
- Pre-Docker hardening tests passed for bearer authentication, timeout failure reporting, and retrying failed builds; `npm run typecheck`, `npm run build`, and domain/API/GitHub tests passed. The `retry_count` migration was applied during Docker executor verification.
- Docker-runner boundary tests passed for constrained, unmounted container creation, command-timeout failure reporting, and forced cleanup; `npm test`, `npm run typecheck`, and `npm run build` passed.
- The Docker runner image built successfully. A real repository build was claimed and executed inside the runner: clone, `npm install`, and `npm test` succeeded; the executor returned `succeeded`, PostgreSQL retained the build/step/log results, and the runner container was cleaned up.
- Image-step unit tests passed for image-reference persistence and image-build failure handling; `npm test`, `npm run typecheck`, and `npm run build` passed.
- A signed local GitHub webhook queued a real build. Docker-isolated clone/install/test, Docker image build, deployment, and HTTP health check all succeeded; PostgreSQL persisted the image reference, deployment, logs, and healthy service state.

## Run locally

```bash
cp .env.example .env
docker compose up -d postgres
docker compose build runner
npm install
npm test
npm run build
npm run db:migrate
npm run db:seed
npm run start:api
npm run start:web
```
