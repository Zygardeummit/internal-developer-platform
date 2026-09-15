CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE build_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE build_step_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped');
CREATE TYPE deployment_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE service_health_status AS ENUM ('unknown', 'healthy', 'unhealthy', 'degraded');
CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error');

CREATE TABLE repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_full_name text NOT NULL UNIQUE,
  clone_url text NOT NULL,
  default_branch text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  commit_sha text NOT NULL,
  branch text NOT NULL,
  status build_status NOT NULL DEFAULT 'queued',
  image_reference text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE build_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  name text NOT NULL,
  status build_step_status NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (build_id, position),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  environment text NOT NULL,
  health_status service_health_status NOT NULL DEFAULT 'unknown',
  health_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repository_id, name, environment)
);

CREATE TABLE deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid NOT NULL REFERENCES builds(id) ON DELETE RESTRICT,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  status deployment_status NOT NULL DEFAULT 'queued',
  image_reference text NOT NULL,
  version text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid REFERENCES builds(id) ON DELETE CASCADE,
  build_step_id uuid REFERENCES build_steps(id) ON DELETE CASCADE,
  deployment_id uuid REFERENCES deployments(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  level log_level NOT NULL DEFAULT 'info',
  message text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(build_id, build_step_id, deployment_id, service_id) = 1)
);

CREATE INDEX builds_repository_created_at_idx ON builds (repository_id, created_at DESC);
CREATE INDEX builds_status_created_at_idx ON builds (status, created_at DESC);
CREATE INDEX builds_repository_branch_created_at_idx ON builds (repository_id, branch, created_at DESC);
CREATE INDEX build_steps_build_position_idx ON build_steps (build_id, position);
CREATE INDEX services_repository_health_idx ON services (repository_id, health_status);
CREATE INDEX deployments_service_created_at_idx ON deployments (service_id, created_at DESC);
CREATE INDEX deployments_build_created_at_idx ON deployments (build_id, created_at DESC);
CREATE INDEX deployments_status_created_at_idx ON deployments (status, created_at DESC);
CREATE INDEX logs_build_occurred_at_idx ON logs (build_id, occurred_at DESC) WHERE build_id IS NOT NULL;
CREATE INDEX logs_build_step_occurred_at_idx ON logs (build_step_id, occurred_at DESC) WHERE build_step_id IS NOT NULL;
CREATE INDEX logs_deployment_occurred_at_idx ON logs (deployment_id, occurred_at DESC) WHERE deployment_id IS NOT NULL;
CREATE INDEX logs_service_occurred_at_idx ON logs (service_id, occurred_at DESC) WHERE service_id IS NOT NULL;
