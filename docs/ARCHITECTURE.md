# MVP Architecture

## Goal and scope

The first MVP manages a delivery run for a GitHub repository:

```text
GitHub repository -> build -> test -> Docker image -> deployment -> health check -> logs/status -> React operations dashboard
```

It is deliberately a modular application, not a microservice platform. Kubernetes, cloud infrastructure, Redis, Kafka, and separate distributed services are out of scope for this phase.

## Proposed project structure

This structure is implemented for the runnable-foundation milestone. Delivery workflow modules remain intentionally unimplemented.

```text
.
├── apps/
│   ├── api/                 # Node.js HTTP API, GitHub webhooks, orchestration
│   └── web/                 # React operations dashboard
├── packages/
│   ├── domain/              # Workflow types, state transitions, shared validation
│   ├── db/                  # PostgreSQL schema, migrations, repositories
│   └── github/              # GitHub API/webhook client and repository sync
├── docker/
│   └── runner/              # Later: constrained build/deploy runner image
├── docs/
├── docker-compose.yml       # Local PostgreSQL and application development services
├── package.json             # Workspace scripts
└── .env.example             # Variable names only; never secrets
```

Use a TypeScript workspace so API, UI, and shared domain contracts remain consistent. The API is the only component allowed to access PostgreSQL directly. The web app uses the API.

## Major components

| Component | Responsibility | MVP boundary |
| --- | --- | --- |
| React dashboard (`apps/web`) | Shows repositories, delivery runs, step status, health, and log excerpts; triggers allowed actions. | No direct GitHub, Docker, or database access. |
| Node API (`apps/api`) | Authenticates dashboard requests, exposes REST endpoints, accepts GitHub webhooks, coordinates workflow execution, and streams/polls status. | One deployable Node application. |
| Domain package | Defines delivery-run states, step results, retry policy, validation, and orchestration interfaces. | Pure application logic; no HTTP or database details. |
| PostgreSQL (`packages/db`) | Stores connected repositories, webhook deliveries, delivery runs, step records, deployment targets, health observations, and log references. | The durable source of operational state. |
| GitHub package | Verifies webhooks, retrieves repository/commit metadata, and later reports deployment/check status back to GitHub. | GitHub is a first-class integration boundary. |
| Docker build runner adapter | Runs repository clone, install, test, image creation, local deployment, and health checks. | Invoked through the execution-runner interface; the build context streams directly to Docker without a host workspace. |
| Docker Compose | Provides the local PostgreSQL and app development environment. | Not a production orchestrator. |

## Data flow

```text
1. GitHub push / manual dashboard action
              |
              v
2. API verifies webhook and records an immutable event + delivery run in PostgreSQL
              |
              v
3. Orchestrator claims the run and advances each persisted step:
   checkout -> build -> test -> image -> deploy -> health check
              |
              v
4. Runner adapter executes the relevant local Docker/command action,
   persists timestamps, exit status, structured output, and log reference
              |
              v
5. API exposes run, deployment, health, and log status to the React dashboard
              |
              v
6. Dashboard polls initially (real-time push can be added later)
```

Every run is tied to a GitHub repository and immutable commit SHA. Delivery state is persisted before and after every step, so the dashboard can show accurate status after an API restart.

## Delivery-run model

Use one ordered workflow with explicit states:

```text
queued -> running -> succeeded
                  -> failed
                  -> cancelled
```

Each run has individual steps: `build`, `test`, `image`, `deploy`, and `health_check`. A step records `queued`, `running`, `succeeded`, `failed`, or `skipped`, plus start/end time, retry count, and log reference. A failed prerequisite prevents subsequent steps from running.

The initial deployment target is one local Docker container per configured service. It publishes an ephemeral localhost port for container port 3000, and health is an HTTP `/health` check against that port. Logs are captured per step in bounded PostgreSQL records; live streaming is a later enhancement.

## Background-job design

Create a `JobQueue`/`RunExecutor` interface in the domain layer. For the first slice, the API can run a small in-process worker that claims queued PostgreSQL rows using transactions and leases. This avoids an extra broker while preserving the boundary needed to add a separate worker process later.

The API must not rely on in-memory workflow state. Idempotency keys for GitHub webhook deliveries and transactional job claims prevent duplicate execution. Running builds receive a fifteen-minute lease; an expired lease makes the row claimable again after a crash. Long-running runner work is represented by persisted run/step records.

## Security and operational boundaries

- Store GitHub credentials and webhook secrets only in environment variables or a future secrets mechanism; never commit them.
- Verify GitHub webhook signatures before creating work.
- Limit MVP repository access to explicitly connected repositories.
- Treat repository build instructions as untrusted: document and later enforce runner isolation, resource limits, and an allowlist of deployment targets before exposing this beyond local development.
- The current build runner drops Linux capabilities, enables `no-new-privileges`, and applies memory, CPU, and process limits. It passes only a temporary HOME and npm cache environment into an unmounted container.
- Keep dashboard authorization simple initially, but put it at the API boundary from day one.

## Recommended development milestones

1. **Runnable foundation** — Create the TypeScript workspace, Node API health endpoint, React dashboard shell, PostgreSQL schema/migrations tooling, and Docker Compose local environment.
2. **Operational data model** — Add repositories, delivery runs, step records, deployment targets, health observations, and API read endpoints. Render these in the dashboard using seeded data.
3. **GitHub connection** — Add connected-repository configuration, webhook signature verification, idempotent delivery storage, and creation of a queued delivery run for a push event.
4. **Local execution path** — Implement the persisted executor and runner adapter for build, test, Docker image creation, deployment to one local Compose target, and HTTP health checks.
5. **Operations experience** — Add run detail, bounded logs, retry/cancel actions, deployment status, and failure visibility in the dashboard.
6. **Hardening** — Add recovery after restart, retry policies, runner constraints, authorization, auditability, end-to-end tests, and GitHub deployment/check reporting.

Each milestone should leave the project runnable, tested, documented, reviewed, committed, and pushed before the next begins.

## Foundation runtime

The API exposes `GET /health` for process liveness and `GET /health/database` for PostgreSQL connectivity. The latter returns HTTP 503 until PostgreSQL is available. The React application is a dashboard shell with a platform-status page.

For local development, copy `.env.example` to `.env`, start PostgreSQL with `docker compose up -d postgres`, run `npm install`, then use `npm run build`, `npm run start:api`, and `npm run start:web`. Run `npm run db:migrate` after PostgreSQL becomes healthy.
