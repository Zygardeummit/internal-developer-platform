import { Pool } from "pg";

export { getBuildStatus, listBuilds, listBuildSteps, listDeployments, listLogs, listRepositories, listServices, requeueBuild } from "./operations.js";
export { createQueuedBuildFromGitHubPush, findRepositoryByGithubFullName, registerRepository, type RepositoryRegistration } from "./github.js";
export { createBuildExecutorStore } from "./executor.js";

export function createDatabasePool(databaseUrl = process.env.DATABASE_URL): Pool {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({ connectionString: databaseUrl });
}

export async function checkDatabaseConnection(pool: Pool): Promise<void> {
  await pool.query("SELECT 1");
}
