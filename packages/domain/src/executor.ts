export interface ClaimedBuild { id: string; repositoryName: string; cloneUrl: string; commitSha: string; serviceId: string; serviceName: string; }
export interface CommandResult { exitCode: number; output: string; }
export interface ImageBuildResult extends CommandResult { imageReference: string; }
export interface DeploymentResult extends CommandResult { containerName: string; healthUrl: string; }
/**
 * Execution boundary: orchestration only depends on this contract. A future
 * Docker-isolated implementation can replace the local host runner directly.
 */
export interface BuildExecutionRunner {
  clone(build: ClaimedBuild): Promise<CommandResult>;
  install(build: ClaimedBuild): Promise<CommandResult>;
  test(build: ClaimedBuild): Promise<CommandResult>;
  image(build: ClaimedBuild): Promise<ImageBuildResult>;
  deploy(build: ClaimedBuild, imageReference: string): Promise<DeploymentResult>;
  health(healthUrl: string): Promise<CommandResult>;
  cleanup(): Promise<void>;
}
export type BuildRunner = BuildExecutionRunner;
export type BuildExecutionResult = "idle" | "succeeded" | "failed" | "retrying";
export interface BuildExecutorStore {
  claimNextBuild(): Promise<ClaimedBuild | null>;
  startStep(buildId: string, position: number, name: string): Promise<string>;
  finishStep(stepId: string, succeeded: boolean): Promise<void>;
  setBuildImageReference(buildId: string, imageReference: string): Promise<void>;
  startDeployment(buildId: string, serviceId: string, imageReference: string, version: string): Promise<string>;
  finishDeployment(deploymentId: string, succeeded: boolean): Promise<void>;
  updateServiceHealth(serviceId: string, healthy: boolean, containerName?: string, healthUrl?: string): Promise<void>;
  finishBuild(buildId: string, succeeded: boolean): Promise<"succeeded" | "failed" | "retrying">;
  log(buildId: string, stepId: string | null, level: "info" | "error", message: string, attributes?: Record<string, unknown>): Promise<void>;
}

export async function executeNextBuild(store: BuildExecutorStore, runner: BuildExecutionRunner): Promise<BuildExecutionResult> {
  const build = await store.claimNextBuild();
  if (!build) return "idle";
  let activeStep: string | null = null;
  let activeDeployment: string | null = null;
  try {
    for (const [position, name, run] of [[1, "clone", runner.clone], [2, "install", runner.install], [3, "test", runner.test]] as const) {
      activeStep = await store.startStep(build.id, position, name);
      const result = await run.call(runner, build);
      await store.log(build.id, activeStep, result.exitCode === 0 ? "info" : "error", `${name} completed`, { exitCode: result.exitCode, output: result.output });
      await store.finishStep(activeStep, result.exitCode === 0);
      if (result.exitCode !== 0) return store.finishBuild(build.id, false);
      activeStep = null;
    }
    activeStep = await store.startStep(build.id, 4, "image");
    const image = await runner.image(build);
    await store.log(build.id, activeStep, image.exitCode === 0 ? "info" : "error", "image completed", { exitCode: image.exitCode, output: image.output, imageReference: image.imageReference });
    await store.finishStep(activeStep, image.exitCode === 0);
    if (image.exitCode !== 0) return store.finishBuild(build.id, false);
    await store.setBuildImageReference(build.id, image.imageReference);
    activeStep = await store.startStep(build.id, 5, "deploy");
    const deploymentId = activeDeployment = await store.startDeployment(build.id, build.serviceId, image.imageReference, build.commitSha.slice(0, 12));
    const deployment = await runner.deploy(build, image.imageReference);
    await store.log(build.id, activeStep, deployment.exitCode === 0 ? "info" : "error", "deployment completed", { exitCode: deployment.exitCode, output: deployment.output, deploymentId, containerName: deployment.containerName });
    await store.finishStep(activeStep, deployment.exitCode === 0);
    if (deployment.exitCode !== 0) { await store.finishDeployment(deploymentId, false); return store.finishBuild(build.id, false); }
    activeStep = await store.startStep(build.id, 6, "health_check");
    const health = await runner.health(deployment.healthUrl);
    await store.log(build.id, activeStep, health.exitCode === 0 ? "info" : "error", "health check completed", { exitCode: health.exitCode, output: health.output, healthUrl: deployment.healthUrl, deploymentId });
    await store.updateServiceHealth(build.serviceId, health.exitCode === 0, deployment.containerName, deployment.healthUrl);
    await store.finishStep(activeStep, health.exitCode === 0);
    await store.finishDeployment(deploymentId, health.exitCode === 0);
    activeDeployment = null;
    if (health.exitCode !== 0) return store.finishBuild(build.id, false);
    return store.finishBuild(build.id, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected executor failure";
    if (activeStep) await store.finishStep(activeStep, false);
    if (activeDeployment) await store.finishDeployment(activeDeployment, false);
    await store.log(build.id, activeStep, "error", "Executor failed", { error: message });
    return store.finishBuild(build.id, false);
  } finally { await runner.cleanup(); }
}
