import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { processPushDelivery, verifyWebhookSignature, type GitHubWebhookStore } from "./index.js";

const body = Buffer.from(JSON.stringify({ ref: "refs/heads/main", after: "abc123", head_commit: { message: "Ship it" }, repository: { full_name: "acme/service" } }));
const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

test("accepts a valid GitHub webhook signature", () => assert.equal(verifyWebhookSignature(body, signature, "secret"), true));
test("rejects an invalid GitHub webhook signature", () => assert.equal(verifyWebhookSignature(body, "sha256=invalid", "secret"), false));
test("queues a build and reports duplicate deliveries", async () => {
  let calls = 0;
  const store: GitHubWebhookStore = { findRepository: async () => ({ id: "repo-1", githubFullName: "acme/service" }), createQueuedBuild: async () => ({ duplicate: calls++ > 0, buildId: "build-1" }) };
  const config = { webhookSecret: "secret", allowedRepositories: ["acme/service"] };
  const first = await processPushDelivery(body, "delivery-1", config, store);
  const duplicate = await processPushDelivery(body, "delivery-1", config, store);
  assert.deepEqual(first, { ignored: false, duplicate: false, buildId: "build-1" });
  assert.deepEqual(duplicate, { ignored: false, duplicate: true, buildId: "build-1" });
  assert.equal(calls, 2);
});
