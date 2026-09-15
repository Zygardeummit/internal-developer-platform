import Fastify from "fastify";
import { checkDatabaseConnection, createBuildExecutorStore, createDatabasePool, createQueuedBuildFromGitHubPush, findRepositoryByGithubFullName, getBuildStatus, listBuilds, listBuildSteps, listDeployments, listLogs, listRepositories, listServices, registerRepository, requeueBuild } from "@idp/db";
import { executeNextBuild, platformName, type ServiceHealth } from "@idp/domain";
import { loadGitHubConfig, processPushDelivery, verifyWebhookSignature, type GitHubConfig, type GitHubWebhookStore } from "@idp/github";
import type { Pool } from "pg";
import { DockerBuildRunner } from "./docker-runner.js";

interface AppOptions { githubConfig?: GitHubConfig; webhookStore?: GitHubWebhookStore; apiAuthToken?: string; }

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: true });
  let pool: Pool | undefined;
  const getPool = () => (pool ??= createDatabasePool());
  const webhookStore = options.webhookStore ?? {
    findRepository: (fullName: string) => findRepositoryByGithubFullName(getPool(), fullName),
    createQueuedBuild: (input: Parameters<GitHubWebhookStore["createQueuedBuild"]>[0]) => createQueuedBuildFromGitHubPush(getPool(), input)
  };
  const githubConfig = options.githubConfig ?? loadGitHubConfig();
  const apiAuthToken = options.apiAuthToken ?? process.env.API_AUTH_TOKEN;
  const requireApiToken = async (request: { headers: { authorization?: string } }, reply: { code(statusCode: number): { send(payload: unknown): unknown } }) => {
    if (apiAuthToken && request.headers.authorization === `Bearer ${apiAuthToken}`) return;
    return reply.code(401).send({ error: "Unauthorized" });
  };

  app.addHook("onClose", async () => { await pool?.end(); });
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

  app.get("/health", async (): Promise<ServiceHealth> => ({
    status: "ok",
    checkedAt: new Date().toISOString()
  }));

  app.get("/health/database", async (_request, reply): Promise<ServiceHealth> => {
    try {
      await checkDatabaseConnection(getPool());
      return { status: "ok", checkedAt: new Date().toISOString() };
    } catch {
      return reply.code(503).send({ status: "unavailable", checkedAt: new Date().toISOString() });
    }
  });

  app.get("/api", async () => ({ name: platformName, status: "foundation" }));
  app.get("/api/repositories", async () => listRepositories(getPool()));
  app.get("/api/builds", async () => listBuilds(getPool()));
  app.get<{ Params: { id: string } }>("/api/builds/:id/status", async (request, reply) => {
    const build = await getBuildStatus(getPool(), request.params.id);
    return build ?? reply.code(404).send({ error: "Build not found" });
  });
  app.get<{ Params: { id: string } }>("/api/builds/:id/steps", async (request) => listBuildSteps(getPool(), request.params.id));
  app.get("/api/deployments", async () => listDeployments(getPool()));
  app.get("/api/services", async () => listServices(getPool()));
  app.get("/api/logs", async () => listLogs(getPool()));
  app.post<{ Body: Buffer }>("/api/repositories", { preHandler: requireApiToken }, async (request, reply) => {
    let input: { githubFullName?: string; cloneUrl?: string; defaultBranch?: string };
    try { input = JSON.parse(request.body.toString("utf8")) as typeof input; } catch { return reply.code(400).send({ error: "Invalid JSON" }); }
    if (!input.githubFullName || !input.cloneUrl || !input.defaultBranch) return reply.code(400).send({ error: "githubFullName, cloneUrl, and defaultBranch are required" });
    return reply.code(201).send(await registerRepository(getPool(), input as Required<typeof input>));
  });
  app.post<{ Body: Buffer }>("/api/github/webhooks", async (request, reply) => {
    if (request.headers["x-github-event"] !== "push") return reply.code(202).send({ ignored: true });
    const deliveryId = request.headers["x-github-delivery"];
    if (typeof deliveryId !== "string") return reply.code(400).send({ error: "Missing GitHub delivery ID" });
    if (!githubConfig.webhookSecret) return reply.code(503).send({ error: "GitHub webhook secret is not configured" });
    const signature = request.headers["x-hub-signature-256"];
    if (!verifyWebhookSignature(request.body, Array.isArray(signature) ? signature[0] : signature, githubConfig.webhookSecret)) return reply.code(401).send({ error: "Invalid GitHub signature" });
    try {
      const result = await processPushDelivery(request.body, deliveryId, githubConfig, webhookStore);
      return reply.code(result.ignored ? 202 : 200).send(result);
    } catch { return reply.code(400).send({ error: "Invalid GitHub push payload" }); }
  });
  app.post("/api/executor/run-once", { preHandler: requireApiToken }, async () => ({ result: await executeNextBuild(createBuildExecutorStore(getPool()), new DockerBuildRunner()) }));
  app.post<{ Params: { id: string } }>("/api/builds/:id/retry", { preHandler: requireApiToken }, async (request, reply) => {
    return (await requeueBuild(getPool(), request.params.id, true)) ? { queued: true } : reply.code(409).send({ error: "Only failed builds can be retried" });
  });
  app.post<{ Params: { id: string } }>("/api/builds/:id/redeploy", { preHandler: requireApiToken }, async (request, reply) => {
    return (await requeueBuild(getPool(), request.params.id, false)) ? { queued: true } : reply.code(409).send({ error: "Only completed builds can be redeployed" });
  });

  return app;
}
