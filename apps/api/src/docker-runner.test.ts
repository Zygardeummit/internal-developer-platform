import assert from "node:assert/strict";
import test from "node:test";
import { DockerBuildRunner, imageReferenceFor } from "./docker-runner.js";

test("runs repository commands in an unmounted, constrained Docker container", async () => {
  const calls: { command: string; args: string[]; timeout: number }[] = [];
  const runner = new DockerBuildRunner({
    commandTimeoutMs: 25,
    execute: async (command, args, options) => { calls.push({ command, args, timeout: options.timeout }); return { stdout: "", stderr: "" }; },
    imageBuilder: async () => ({ exitCode: 0, output: "image built" })
  });
  const build = { id: "build-1", repositoryName: "example/repo", cloneUrl: "https://example.test/repo.git", commitSha: "abc", serviceId: "service-1", serviceName: "repo" };
  assert.equal((await runner.clone(build)).exitCode, 0);
  assert.equal((await runner.install()).exitCode, 0);
  assert.equal((await runner.test()).exitCode, 0);
  assert.equal((await runner.image(build)).imageReference, "idp/example/repo:abc");
  await runner.cleanup();

  const create = calls[0]!;
  assert.equal(create.command, "docker");
  assert.deepEqual(create.args.slice(0, 2), ["create", "--name"]);
  assert.ok(create.args.includes("--cap-drop"));
  assert.ok(create.args.includes("no-new-privileges"));
  assert.ok(!create.args.some((arg) => arg.includes("--volume") || arg.includes("--mount")));
  assert.equal(calls.every((call) => call.timeout === 25), true);
  assert.deepEqual(calls.at(-1)?.args.slice(0, 2), ["rm", "--force"]);
  assert.ok(calls.some((call) => call.args.includes("npm") && call.args.includes("install")));
  assert.ok(calls.some((call) => call.args.includes("npm") && call.args.includes("test")));
  assert.ok(calls.some((call) => call.args.join(" ") === "image inspect idp/example/repo:abc"));
});

test("reports Docker command timeouts and still removes the build container", async () => {
  let call = 0;
  const runner = new DockerBuildRunner({
    commandTimeoutMs: 25,
    execute: async () => {
      call += 1;
      if (call === 3) throw Object.assign(new Error("killed"), { killed: true, stdout: "partial output" });
      return { stdout: "", stderr: "" };
    }
  });
  const result = await runner.clone({ id: "build-1", repositoryName: "example/repo", cloneUrl: "https://example.test/repo.git", commitSha: "abc", serviceId: "service-1", serviceName: "repo" });
  await runner.cleanup();
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Command timed out after 25ms/);
  assert.equal(call, 4);
});

test("builds a tagged image from the isolated repository and surfaces build failures", async () => {
  const calls: string[][] = [];
  const runner = new DockerBuildRunner({
    execute: async (_command, args) => { calls.push(args); return { stdout: "", stderr: "" }; },
    imageBuilder: async (_container, _reference) => ({ exitCode: 1, output: "Dockerfile failed" })
  });
  const build = { id: "build-1", repositoryName: "Acme/Service", cloneUrl: "https://example.test/repo.git", commitSha: "abc123def456789", serviceId: "service-1", serviceName: "service" };
  await runner.clone(build);
  const result = await runner.image(build);
  await runner.cleanup();
  assert.equal(result.exitCode, 1);
  assert.equal(result.imageReference, "idp/acme/service:abc123def456789");
  assert.ok(calls.some((args) => args.some((arg) => arg.includes("/workspace/repository/Dockerfile"))));
  assert.equal(imageReferenceFor(build), "idp/acme/service:abc123def456789");
});
