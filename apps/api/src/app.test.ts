import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { GitHubWebhookStore } from "@idp/github";
import { buildApp } from "./app.js";

const payload = Buffer.from(JSON.stringify({ ref: "refs/heads/main", after: "abc123", head_commit: { message: "Queue this build" }, repository: { full_name: "acme/service" } }));
const signature = `sha256=${createHmac("sha256", "test-secret").update(payload).digest("hex")}`;

function setup() {
  const deliveries = new Set<string>();
  const queued: Parameters<GitHubWebhookStore["createQueuedBuild"]>[0][] = [];
  const store: GitHubWebhookStore = {
    findRepository: async () => ({ id: "repo-1", githubFullName: "acme/service" }),
    createQueuedBuild: async (input) => {
      if (deliveries.has(input.deliveryId)) return { duplicate: true };
      deliveries.add(input.deliveryId); queued.push(input); return { duplicate: false, buildId: "build-1" };
    }
  };
  return { app: buildApp({ githubConfig: { webhookSecret: "test-secret", allowedRepositories: ["acme/service"] }, webhookStore: store }), queued };
}

test("accepts a valid push webhook and queues a build", async () => {
  const { app, queued } = setup();
  const response = await app.inject({ method: "POST", url: "/api/github/webhooks", headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "delivery-1", "x-hub-signature-256": signature }, payload });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ignored: false, duplicate: false, buildId: "build-1" });
  assert.deepEqual(queued[0] && { branch: queued[0].branch, commitSha: queued[0].commitSha, commitMessage: queued[0].commitMessage }, { branch: "main", commitSha: "abc123", commitMessage: "Queue this build" });
  await app.close();
});

test("rejects invalid signatures and flags duplicate deliveries", async () => {
  const { app, queued } = setup();
  const headers = { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "delivery-1", "x-hub-signature-256": signature };
  const invalid = await app.inject({ method: "POST", url: "/api/github/webhooks", headers: { ...headers, "x-hub-signature-256": "sha256=bad" }, payload });
  assert.equal(invalid.statusCode, 401);
  const first = await app.inject({ method: "POST", url: "/api/github/webhooks", headers, payload });
  const duplicate = await app.inject({ method: "POST", url: "/api/github/webhooks", headers, payload });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(duplicate.json(), { ignored: false, duplicate: true });
  assert.equal(queued.length, 1);
  await app.close();
});

test("requires the shared bearer token for repository registration and executor triggers", async () => {
  const app = buildApp({ apiAuthToken: "api-token" });
  const repository = await app.inject({ method: "POST", url: "/api/repositories", payload: {} });
  const executor = await app.inject({ method: "POST", url: "/api/executor/run-once" });
  const authorized = await app.inject({ method: "POST", url: "/api/repositories", headers: { authorization: "Bearer api-token", "content-type": "application/json" }, payload: Buffer.from("not-json") });
  assert.equal(repository.statusCode, 401);
  assert.equal(executor.statusCode, 401);
  assert.equal(authorized.statusCode, 400);
  await app.close();
});
