import type { Pool } from "pg";
import type { BuildExecutorStore, ClaimedBuild } from "@idp/domain";

const maxBuildAttempts = 2;
const leaseSeconds = 15 * 60;

export function createBuildExecutorStore(pool: Pool): BuildExecutorStore {
  return {
    async claimNextBuild(): Promise<ClaimedBuild | null> {
      const { rows } = await pool.query<ClaimedBuild>(`
        WITH next_build AS (
          SELECT id FROM builds
          WHERE status = 'queued' OR (status = 'failed' AND retry_count < $1) OR (status = 'running' AND lease_expires_at < now())
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE builds b SET status = 'running', started_at = COALESCE(b.started_at, now()), completed_at = NULL, lease_expires_at = now() + ($2 * interval '1 second'), updated_at = now()
        FROM next_build, repositories r
        JOIN services s ON s.repository_id = r.id AND s.environment = 'development'
        WHERE b.id = next_build.id AND r.id = b.repository_id
        RETURNING b.id, r.github_full_name AS "repositoryName", r.clone_url AS "cloneUrl", b.commit_sha AS "commitSha", s.id AS "serviceId", s.name AS "serviceName"
      `, [maxBuildAttempts, leaseSeconds]);
      return rows[0] ?? null;
    },
    async startStep(buildId, position, name) {
      const { rows } = await pool.query<{ id: string }>(`
        INSERT INTO build_steps (build_id, position, name, status, started_at, completed_at)
        VALUES ($1, $2, $3, 'running', now(), NULL)
        ON CONFLICT (build_id, position) DO UPDATE
        SET status = 'running', started_at = now(), completed_at = NULL, updated_at = now()
        RETURNING id
      `, [buildId, position, name]);
      return rows[0]!.id;
    },
    async finishStep(stepId, succeeded) {
      await pool.query(`UPDATE build_steps SET status = $2, completed_at = now(), updated_at = now() WHERE id = $1`, [stepId, succeeded ? "succeeded" : "failed"]);
    },
    async setBuildImageReference(buildId, imageReference) {
      await pool.query(`UPDATE builds SET image_reference = $2, updated_at = now() WHERE id = $1`, [buildId, imageReference]);
    },
    async finishBuild(buildId, succeeded) {
      if (succeeded) {
        await pool.query(`UPDATE builds SET status = 'succeeded', completed_at = now(), lease_expires_at = NULL, updated_at = now() WHERE id = $1`, [buildId]);
        return "succeeded" as const;
      }
      const { rows } = await pool.query<{ retrying: boolean }>(`
        UPDATE builds
        SET status = 'failed', retry_count = retry_count + 1, completed_at = now(), lease_expires_at = NULL, updated_at = now()
        WHERE id = $1
        RETURNING retry_count < $2 AS retrying
      `, [buildId, maxBuildAttempts]);
      return rows[0]?.retrying ? "retrying" as const : "failed" as const;
    },
    async startDeployment(buildId, serviceId, imageReference, version) {
      const { rows } = await pool.query<{ id: string }>(`INSERT INTO deployments (build_id, service_id, status, image_reference, version, started_at) VALUES ($1, $2, 'running', $3, $4, now()) RETURNING id`, [buildId, serviceId, imageReference, version]);
      return rows[0]!.id;
    },
    async finishDeployment(deploymentId, succeeded) {
      await pool.query(`UPDATE deployments SET status = $2, completed_at = now(), updated_at = now() WHERE id = $1`, [deploymentId, succeeded ? "succeeded" : "failed"]);
    },
    async updateServiceHealth(serviceId, healthy, containerName, healthUrl) {
      await pool.query(`UPDATE services SET health_status = $2, health_checked_at = now(), container_name = COALESCE($3, container_name), health_url = COALESCE($4, health_url), updated_at = now() WHERE id = $1`, [serviceId, healthy ? "healthy" : "unhealthy", containerName ?? null, healthUrl ?? null]);
    },
    async log(buildId, stepId, level, message, attributes = {}) {
      if (stepId) await pool.query(`INSERT INTO logs (build_step_id, level, message, attributes) VALUES ($1, $2, $3, $4::jsonb)`, [stepId, level, message, JSON.stringify(attributes)]);
      else await pool.query(`INSERT INTO logs (build_id, level, message, attributes) VALUES ($1, $2, $3, $4::jsonb)`, [buildId, level, message, JSON.stringify(attributes)]);
    }
  };
}
