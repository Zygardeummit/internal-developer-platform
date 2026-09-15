import assert from "node:assert/strict";
import test from "node:test";
import { executeNextBuild, type BuildExecutorStore, type BuildRunner } from "./executor.js";

function setup(results = [0, 0, 0, 0]) {
  const events: string[] = [];
  const store: BuildExecutorStore = {
    claimNextBuild: async () => ({ id: "build-1", repositoryName: "example/repo", cloneUrl: "https://example.test/repo.git", commitSha: "abc", serviceId: "service-1", serviceName: "repo" }),
    startStep: async (_build, _position, name) => { events.push(`start:${name}`); return name; },
    finishStep: async (id, ok) => { events.push(`step:${id}:${ok}`); },
    setBuildImageReference: async (_id, reference) => { events.push(`image:${reference}`); },
    startDeployment: async () => { events.push("deployment:start"); return "deployment-1"; },
    finishDeployment: async (_id, ok) => { events.push(`deployment:${ok}`); },
    updateServiceHealth: async (_id, healthy) => { events.push(`health:${healthy}`); },
    finishBuild: async (_id, ok) => { events.push(`build:${ok}`); return ok ? "succeeded" : "failed"; },
    log: async (_build, step, level) => { events.push(`log:${step}:${level}`); }
  };
  const runner: BuildRunner = {
    clone: async () => ({ exitCode: results[0]!, output: "clone" }),
    install: async () => ({ exitCode: results[1]!, output: "install" }),
    test: async () => ({ exitCode: results[2]!, output: "test" }),
    image: async () => ({ exitCode: results[3]!, output: "image", imageReference: "idp/example/repo:abc" }),
    deploy: async () => ({ exitCode: results[4] ?? 0, output: "deploy", containerName: "service-1", healthUrl: "http://localhost/health" }),
    health: async () => ({ exitCode: results[5] ?? 0, output: "healthy" }),
    cleanup: async () => { events.push("cleanup"); }
  };
  return { store, runner, events };
}

test("persists successful build, deployment, and health transitions", async () => {
  const { store, runner, events } = setup();
  assert.equal(await executeNextBuild(store, runner), "succeeded");
  assert.deepEqual(events, ["start:clone", "log:clone:info", "step:clone:true", "start:install", "log:install:info", "step:install:true", "start:test", "log:test:info", "step:test:true", "start:image", "log:image:info", "step:image:true", "image:idp/example/repo:abc", "start:deploy", "deployment:start", "log:deploy:info", "step:deploy:true", "start:health_check", "log:health_check:info", "health:true", "step:health_check:true", "deployment:true", "build:true", "cleanup"]);
});
test("records a failed step and does not execute later steps", async () => {
  const { store, runner, events } = setup([0, 1, 0]);
  assert.equal(await executeNextBuild(store, runner), "failed");
  assert.deepEqual(events, ["start:clone", "log:clone:info", "step:clone:true", "start:install", "log:install:error", "step:install:false", "build:false", "cleanup"]);
});
test("contains runner exceptions and marks the build failed", async () => {
  const { store, runner, events } = setup();
  runner.install = async () => { throw new Error("npm unavailable"); };
  assert.equal(await executeNextBuild(store, runner), "failed");
  assert.deepEqual(events, ["start:clone", "log:clone:info", "step:clone:true", "start:install", "step:install:false", "log:install:error", "build:false", "cleanup"]);
});

test("fails the build when Docker image creation fails", async () => {
  const { store, runner, events } = setup([0, 0, 0, 1]);
  assert.equal(await executeNextBuild(store, runner), "failed");
  assert.deepEqual(events, ["start:clone", "log:clone:info", "step:clone:true", "start:install", "log:install:info", "step:install:true", "start:test", "log:test:info", "step:test:true", "start:image", "log:image:error", "step:image:false", "build:false", "cleanup"]);
});

test("reports a retrying failed build so a later executor run can retry it", async () => {
  const { store, runner, events } = setup([1, 0, 0]);
  store.finishBuild = async (_id, ok) => { events.push(`build:${ok}`); return "retrying"; };
  assert.equal(await executeNextBuild(store, runner), "retrying");
  assert.deepEqual(events, ["start:clone", "log:clone:error", "step:clone:false", "build:false", "cleanup"]);
});
