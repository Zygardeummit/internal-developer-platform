import { createHmac, timingSafeEqual } from "node:crypto";

export interface GitHubConfig { webhookSecret?: string; allowedRepositories: string[]; }
export interface ConfiguredRepository { id: string; githubFullName: string; }
export interface QueuedPushBuild { repositoryId: string; deliveryId: string; commitSha: string; branch: string; commitMessage: string; payload: unknown; }
export interface GitHubWebhookStore {
  findRepository(fullName: string): Promise<ConfiguredRepository | null>;
  createQueuedBuild(input: QueuedPushBuild): Promise<{ duplicate: boolean; buildId?: string }>;
}

export function loadGitHubConfig(env = process.env): GitHubConfig {
  return { webhookSecret: env.GITHUB_WEBHOOK_SECRET, allowedRepositories: (env.GITHUB_ALLOWED_REPOSITORIES ?? "").split(",").map((value) => value.trim()).filter(Boolean) };
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

interface PushPayload { ref?: string; after?: string; head_commit?: { message?: string } | null; repository?: { full_name?: string }; }

export async function processPushDelivery(rawBody: Buffer, deliveryId: string, config: GitHubConfig, store: GitHubWebhookStore) {
  const payload = JSON.parse(rawBody.toString("utf8")) as PushPayload;
  const fullName = payload.repository?.full_name;
  if (!fullName || !payload.ref?.startsWith("refs/heads/") || !payload.after) return { ignored: true } as const;
  if (config.allowedRepositories.length > 0 && !config.allowedRepositories.includes(fullName)) return { ignored: true } as const;
  const repository = await store.findRepository(fullName);
  if (!repository) return { ignored: true } as const;
  const result = await store.createQueuedBuild({ repositoryId: repository.id, deliveryId, commitSha: payload.after, branch: payload.ref.slice("refs/heads/".length), commitMessage: payload.head_commit?.message ?? "", payload });
  return { ignored: false, ...result } as const;
}
