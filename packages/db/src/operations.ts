import type { Pool } from "pg";
import type { Build, BuildStep, Deployment, LogEntry, Repository, Service } from "@idp/domain";

type Timestamp = Date | null;
type RepositoryRow = Omit<Repository, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };
type BuildRow = Omit<Build, "startedAt" | "completedAt" | "createdAt"> & { startedAt: Timestamp; completedAt: Timestamp; createdAt: Date };
type BuildStepRow = Omit<BuildStep, "startedAt" | "completedAt"> & { startedAt: Timestamp; completedAt: Timestamp };
type DeploymentRow = Omit<Deployment, "startedAt" | "completedAt" | "createdAt"> & { startedAt: Timestamp; completedAt: Timestamp; createdAt: Date };
type ServiceRow = Omit<Service, "healthCheckedAt" | "createdAt"> & { healthCheckedAt: Timestamp; createdAt: Date };
type LogRow = Omit<LogEntry, "occurredAt"> & { occurredAt: Date };
const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export async function listRepositories(pool: Pool): Promise<Repository[]> {
  const { rows } = await pool.query<RepositoryRow>(`SELECT id, github_full_name AS "githubFullName", clone_url AS "cloneUrl", default_branch AS "defaultBranch", created_at AS "createdAt", updated_at AS "updatedAt" FROM repositories ORDER BY github_full_name`);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
}
export async function listBuilds(pool: Pool): Promise<Build[]> {
  const { rows } = await pool.query<BuildRow>(`SELECT b.id, b.repository_id AS "repositoryId", r.github_full_name AS "repositoryName", b.commit_sha AS "commitSha", b.branch, b.status, b.image_reference AS "imageReference", b.started_at AS "startedAt", b.completed_at AS "completedAt", b.created_at AS "createdAt" FROM builds b JOIN repositories r ON r.id = b.repository_id ORDER BY b.created_at DESC`);
  return rows.map((row) => ({ ...row, startedAt: iso(row.startedAt), completedAt: iso(row.completedAt), createdAt: row.createdAt.toISOString() }));
}
export async function listBuildSteps(pool: Pool, buildId: string): Promise<BuildStep[]> {
  const { rows } = await pool.query<BuildStepRow>(`SELECT id, build_id AS "buildId", position, name, status, started_at AS "startedAt", completed_at AS "completedAt" FROM build_steps WHERE build_id = $1 ORDER BY position`, [buildId]);
  return rows.map((row) => ({ ...row, startedAt: iso(row.startedAt), completedAt: iso(row.completedAt) }));
}
export async function listDeployments(pool: Pool): Promise<Deployment[]> {
  const { rows } = await pool.query<DeploymentRow>(`SELECT d.id, d.build_id AS "buildId", d.service_id AS "serviceId", s.name AS "serviceName", s.environment, d.status, d.image_reference AS "imageReference", d.version, d.started_at AS "startedAt", d.completed_at AS "completedAt", d.created_at AS "createdAt" FROM deployments d JOIN services s ON s.id = d.service_id ORDER BY d.created_at DESC`);
  return rows.map((row) => ({ ...row, startedAt: iso(row.startedAt), completedAt: iso(row.completedAt), createdAt: row.createdAt.toISOString() }));
}
export async function listServices(pool: Pool): Promise<Service[]> {
  const { rows } = await pool.query<ServiceRow>(`SELECT s.id, s.repository_id AS "repositoryId", r.github_full_name AS "repositoryName", s.name, s.environment, s.health_status AS "healthStatus", s.health_checked_at AS "healthCheckedAt", s.container_name AS "containerName", s.health_url AS "healthUrl", s.created_at AS "createdAt" FROM services s JOIN repositories r ON r.id = s.repository_id ORDER BY r.github_full_name, s.name, s.environment`);
  return rows.map((row) => ({ ...row, healthCheckedAt: iso(row.healthCheckedAt), createdAt: row.createdAt.toISOString() }));
}
export async function getBuildStatus(pool: Pool, buildId: string): Promise<Build | null> {
  const builds = await pool.query<BuildRow>(`SELECT b.id, b.repository_id AS "repositoryId", r.github_full_name AS "repositoryName", b.commit_sha AS "commitSha", b.branch, b.status, b.image_reference AS "imageReference", b.started_at AS "startedAt", b.completed_at AS "completedAt", b.created_at AS "createdAt" FROM builds b JOIN repositories r ON r.id = b.repository_id WHERE b.id = $1`, [buildId]);
  const row = builds.rows[0];
  return row ? { ...row, startedAt: iso(row.startedAt), completedAt: iso(row.completedAt), createdAt: row.createdAt.toISOString() } : null;
}
export async function requeueBuild(pool: Pool, buildId: string, onlyFailed: boolean): Promise<boolean> {
  const result = await pool.query(`UPDATE builds SET status = 'queued', retry_count = 0, started_at = NULL, completed_at = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1 AND status ${onlyFailed ? "= 'failed'" : "IN ('failed', 'succeeded')"}`, [buildId]);
  return result.rowCount === 1;
}
export async function listLogs(pool: Pool): Promise<LogEntry[]> {
  const { rows } = await pool.query<LogRow>(`SELECT id, build_id AS "buildId", build_step_id AS "buildStepId", deployment_id AS "deploymentId", service_id AS "serviceId", level, message, attributes, occurred_at AS "occurredAt" FROM logs ORDER BY occurred_at DESC LIMIT 100`);
  return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
}
