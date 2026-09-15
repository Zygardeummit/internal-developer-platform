# Project Instructions

## Project

We are building an Internal Developer Platform.

Technology stack:

* TypeScript
* React
* Node.js
* PostgreSQL
* Docker
* GitHub
* Linux

The platform should eventually support:

* Repository integration
* Build execution
* Automated testing
* Containerization
* Deployment tracking
* Service health checks
* Logs
* Retries
* Failure handling
* Recovery workflows
* Operations dashboard

## Core Working Rules

Before starting work:

1. Read `CURRENT_STATE.md`.
2. Read `docs/ARCHITECTURE.md`.
3. Read `docs/DECISIONS.md`.
4. Inspect the relevant existing code.
5. Check Git status.

Do not assume that a feature works. Test it.

Do not rewrite working code unnecessarily.

Prefer simple solutions over unnecessary infrastructure.

Do not introduce Kubernetes, cloud services, Redis, Kafka, microservices, or other infrastructure unless there is a concrete reason and the current architecture requires it.

Keep the application runnable at every major milestone.

Use TypeScript throughout the application code.

Use PostgreSQL as the persistent database.

Use Docker for containerization.

## Git Rules

GitHub is the long-term source of truth for this project.

After every meaningful completed milestone:

1. Run relevant tests.
2. Review the diff.
3. Update `CURRENT_STATE.md`.
4. Commit the changes.
5. Push the commit to GitHub.

Use clear commit messages.

Never commit secrets, API keys, passwords, tokens, `.env` files containing secrets, private keys, or generated credentials.

Before making large architectural changes, inspect the current repository and existing Git history.

Do not reset, force-push, delete branches, or discard user changes unless explicitly instructed.

## GitHub Interaction

Use GitHub through `git` and `gh` when useful.

GitHub should be used to:

* inspect repository state
* create branches
* create issues for substantial tasks
* inspect CI results
* inspect pull requests
* review changes
* preserve completed milestones

Do not perform unnecessary GitHub operations for trivial edits.

## Current State

`CURRENT_STATE.md` is the compact handoff document for another AI agent.

Keep it small.

It should describe what is true NOW, not contain a huge historical log.

After meaningful changes, update:

* current stage
* completed work
* work in progress
* exact next steps
* known problems
* recent important changes
* test results
* commands needed to run the project

## Architecture Documentation

# Token Efficiency Rules

Minimize token usage.

* Do not explain obvious code changes.
* Do not provide long summaries after tasks.
* Keep responses concise and action-oriented.
* Do not repeat information already present in project files.
* Read only the files relevant to the current task.
* Do not repeatedly reread the entire repository.
* Read `CURRENT_STATE.md` first, then inspect only relevant files.
* Do not print large files unless necessary for debugging.
* Do not paste source code into responses unless specifically requested.
* Do not describe every command before running it.
* Group related shell commands when practical.
* Prefer editing files directly over discussing what could be edited.
* Run only relevant tests instead of the entire test suite when possible.
* Do not run expensive builds/tests unnecessarily.
* Keep `CURRENT_STATE.md` compact.
* Do not maintain a verbose changelog.

## Task Execution

For each task:

1. Inspect only what is necessary.
2. Implement the change.
3. Run the smallest relevant verification.
4. Fix failures.
5. Update `CURRENT_STATE.md`.
6. Commit and push when the milestone is complete.
7. Give a concise result.

Use this response format:

DONE:
<1-3 sentence summary>

CHANGED: <files>

TEST:
<command + result>

NEXT: <next task>

Only provide detailed reasoning when there is a genuine architectural problem, ambiguity, failure, or risk that requires human input.


Keep `docs/ARCHITECTURE.md` synchronized with the actual implementation.

Keep `docs/DECISIONS.md` synchronized with important architectural decisions.

## Task Discipline

Work in small milestones.

For each milestone:

Plan → implement → test → inspect diff → update state → commit → push.

Do not attempt to build the entire platform in one giant task.

When blocked, stop guessing and document the blocker in `CURRENT_STATE.md`.

When a task is complete, explicitly state what was tested and the result.
