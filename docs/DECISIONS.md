# Architecture Decisions

## ADR-001: Start as a modular monolith

**Decision:** Build one Node.js API application and one React application in a shared TypeScript workspace, with clear internal packages for domain logic, database access, and GitHub integration.

**Why:** The MVP has a single delivery workflow and one team boundary. Separate services would add deployment, networking, observability, and coordination work before they provide value.

**Consequences:** Modules must have explicit interfaces so a runner or worker can be extracted later if scale or isolation requires it. No microservices are introduced now.

## ADR-002: PostgreSQL is the durable operational store

**Decision:** Use PostgreSQL for repository configuration, webhook deliveries, runs, step status, deployment records, health observations, and log references.

**Why:** Delivery execution needs durable, queryable state and transactional idempotency. PostgreSQL satisfies this without adding a queue or cache service.

**Consequences:** The API cannot treat memory as the source of truth. Database migrations and backups become part of the application foundation.

## ADR-003: Use a database-backed job boundary, initially in-process

**Decision:** Represent queued work in PostgreSQL and define an executor interface. Initially, an in-process worker in the API claims and processes jobs using transactional leases.

**Why:** This is the smallest practical solution that survives restarts and supports future background workers cleanly, without Redis, Kafka, or another broker.

**Consequences:** Long-running work must update persisted state. A separate worker process can later use the same tables and interface when needed.

## ADR-004: GitHub is a first-class domain integration

**Decision:** Model GitHub repositories, webhook deliveries, commit SHAs, and later GitHub check/deployment reporting explicitly in the data model and application packages.

**Why:** GitHub is both the workflow entry point and the identity of the source being delivered; it should not be a generic afterthought or a dashboard-only link.

**Consequences:** Webhook verification and idempotency are MVP requirements. The workflow is always traceable to a repository and commit.

## ADR-005: Docker Compose is the initial local deployment target

**Decision:** Use Docker and Docker Compose locally for dependencies and the first managed deployment target.

**Why:** It makes the full MVP path demonstrable with minimal infrastructure.

**Consequences:** Kubernetes and cloud providers are explicitly deferred. The runner/deployment adapter must avoid baking Compose assumptions into the core domain.

## ADR-006: React dashboard consumes the API only

**Decision:** The React operations dashboard reads and acts through the Node API; it does not connect directly to PostgreSQL, GitHub, or Docker.

**Why:** This centralizes authorization, auditability, and operational policy.

**Consequences:** Initial updates may use polling. WebSockets or server-sent events are deferred until operational need justifies them.

## ADR-007: Use explicit persisted workflow states

**Decision:** Persist a delivery run and ordered step records with terminal and non-terminal statuses, timestamps, retry counts, and log references.

**Why:** Operators need trustworthy status, retries, and diagnostics; a linear shell script cannot provide recovery or a meaningful dashboard.

**Consequences:** The first executor needs transaction-safe claiming and idempotent step handling. Live log streaming is not required for the initial path.

## ADR-008: Isolate repository commands in a short-lived Docker container

**Decision:** Run clone, install, test, and image-creation commands through a per-build Docker container, accessed only through the existing execution-runner interface.

**Why:** Repository build instructions are untrusted and must not execute directly on the API host or use a host-mounted workspace.

**Consequences:** The local Docker runner image must be built before execution. The npm-only image Dockerfile is generated in the isolated workspace and its context streams directly to Docker. Output remains captured through existing executor logs, and cleanup force-removes the container after every outcome.

## ADR-009: Deploy one local Docker container with a conventional health endpoint

**Decision:** Deploy the generated image as one named local Docker container, mapped to an ephemeral localhost port, and check `GET /health`. The image runs `npm start` and exposes port 3000.

**Why:** This provides a demonstrable local deployment path without Compose generation, cloud credentials, or a configurable pipeline.

**Consequences:** MVP services must follow the npm `start`, port 3000, and `/health` convention. A deployment or health failure fails the build and consumes its existing single retry.
