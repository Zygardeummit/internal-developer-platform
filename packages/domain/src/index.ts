export const platformName = "Internal Developer Platform";
export { executeNextBuild, type BuildExecutorStore, type BuildExecutionRunner, type BuildExecutionResult, type BuildRunner, type ClaimedBuild, type CommandResult, type ImageBuildResult, type DeploymentResult } from "./executor.js";

export type HealthStatus = "ok" | "unavailable";

export interface ServiceHealth {
  status: HealthStatus;
  checkedAt: string;
}

export type BuildStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type BuildStepStatus = BuildStatus | "skipped";
export type DeploymentStatus = BuildStatus;
export type ServiceHealthStatus = "unknown" | "healthy" | "unhealthy" | "degraded";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Repository { id: string; githubFullName: string; cloneUrl: string; defaultBranch: string; createdAt: string; updatedAt: string; }
export interface Build { id: string; repositoryId: string; repositoryName: string; commitSha: string; branch: string; status: BuildStatus; imageReference: string | null; startedAt: string | null; completedAt: string | null; createdAt: string; }
export interface BuildStep { id: string; buildId: string; position: number; name: string; status: BuildStepStatus; startedAt: string | null; completedAt: string | null; }
export interface Deployment { id: string; buildId: string; serviceId: string; serviceName: string; environment: string; status: DeploymentStatus; imageReference: string; version: string; startedAt: string | null; completedAt: string | null; createdAt: string; }
export interface Service { id: string; repositoryId: string; repositoryName: string; name: string; environment: string; healthStatus: ServiceHealthStatus; healthCheckedAt: string | null; containerName: string | null; healthUrl: string | null; createdAt: string; }
export interface LogEntry { id: string; buildId: string | null; buildStepId: string | null; deploymentId: string | null; serviceId: string | null; level: LogLevel; message: string; attributes: Record<string, unknown>; occurredAt: string; }
