import type { Pool } from "pg";
import type { ConfiguredRepository, QueuedPushBuild } from "@idp/github";

export interface RepositoryRegistration { githubFullName: string; cloneUrl: string; defaultBranch: string; }

export async function registerRepository(pool: Pool, input: RepositoryRegistration): Promise<ConfiguredRepository> {
  const { rows } = await pool.query<ConfiguredRepository>(`
    INSERT INTO repositories (github_full_name, clone_url, default_branch)
    VALUES ($1, $2, $3)
    ON CONFLICT (github_full_name) DO UPDATE SET clone_url = EXCLUDED.clone_url, default_branch = EXCLUDED.default_branch, updated_at = now()
    RETURNING id, github_full_name AS "githubFullName"
  `, [input.githubFullName, input.cloneUrl, input.defaultBranch]);
  const repository = rows[0]!;
  const name = input.githubFullName.split("/").at(-1)!;
  await pool.query(`INSERT INTO services (repository_id, name, environment) VALUES ($1, $2, 'development') ON CONFLICT (repository_id, name, environment) DO NOTHING`, [repository.id, name]);
  return repository;
}

export async function findRepositoryByGithubFullName(pool: Pool, fullName: string): Promise<ConfiguredRepository | null> {
  const { rows } = await pool.query<ConfiguredRepository>(`SELECT id, github_full_name AS "githubFullName" FROM repositories WHERE github_full_name = $1`, [fullName]);
  return rows[0] ?? null;
}

export async function createQueuedBuildFromGitHubPush(pool: Pool, input: QueuedPushBuild): Promise<{ duplicate: boolean; buildId?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const delivery = await client.query<{ id: string }>(`
      INSERT INTO github_webhook_deliveries (delivery_id, repository_id, event_type, payload)
      VALUES ($1, $2, 'push', $3::jsonb)
      ON CONFLICT (delivery_id) DO NOTHING
      RETURNING id
    `, [input.deliveryId, input.repositoryId, JSON.stringify(input.payload)]);
    if (!delivery.rowCount) { await client.query("ROLLBACK"); return { duplicate: true }; }
    const build = await client.query<{ id: string }>(`
      INSERT INTO builds (repository_id, commit_sha, branch, commit_message, status)
      VALUES ($1, $2, $3, $4, 'queued') RETURNING id
    `, [input.repositoryId, input.commitSha, input.branch, input.commitMessage]);
    const buildId = build.rows[0]!.id;
    await client.query("UPDATE github_webhook_deliveries SET build_id = $1 WHERE id = $2", [buildId, delivery.rows[0]!.id]);
    await client.query("COMMIT");
    return { duplicate: false, buildId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
