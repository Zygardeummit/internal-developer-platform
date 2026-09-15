import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { BuildExecutionRunner, ClaimedBuild, CommandResult, DeploymentResult, ImageBuildResult } from "@idp/domain";

const execFileAsync = promisify(execFile);
const defaultCommandTimeoutMs = 10 * 60 * 1000;
const defaultRunnerImage = "idp-build-runner:local";

export interface DockerCommandExecutor {
  (command: string, args: string[], options: { maxBuffer: number; timeout: number; killSignal: NodeJS.Signals }): Promise<{ stdout: string; stderr: string }>;
}

const executeDockerCommand: DockerCommandExecutor = (command, args, options) => execFileAsync(command, args, options);

export interface DockerImageBuilder { (containerName: string, imageReference: string, timeoutMs: number): Promise<CommandResult>; }

const buildDockerImage: DockerImageBuilder = (containerName, imageReference, timeoutMs) => new Promise((resolve) => {
  const archive = spawn("docker", ["exec", containerName, "tar", "--exclude=node_modules", "--exclude=.git", "-C", "/workspace/repository", "-cf", "-", "."]);
  const build = spawn("docker", ["build", "--progress=plain", "--tag", imageReference, "-"]);
  let output = "";
  let timedOut = false;
  const append = (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-100_000); };
  archive.stderr.on("data", append);
  build.stdout.on("data", append);
  build.stderr.on("data", append);
  archive.stdout.pipe(build.stdin);
  const timer = setTimeout(() => { timedOut = true; archive.kill("SIGTERM"); build.kill("SIGTERM"); }, timeoutMs);
  archive.on("close", (code) => { if (code !== 0) build.kill("SIGTERM"); });
  build.on("close", (code) => {
    clearTimeout(timer);
    resolve({ exitCode: timedOut ? 1 : code ?? 1, output: timedOut ? `Command timed out after ${timeoutMs}ms\n${output}`.slice(-100_000) : output });
  });
  archive.on("error", (error) => build.stdin.destroy(error));
  build.on("error", (error) => { clearTimeout(timer); resolve({ exitCode: 1, output: `${output}${error.message}`.slice(-100_000) }); });
});

export class DockerBuildRunner implements BuildExecutionRunner {
  private containerName?: string;
  private readonly commandTimeoutMs: number;
  private readonly runnerImage: string;
  private readonly execute: DockerCommandExecutor;
  private readonly imageBuilder: DockerImageBuilder;

  constructor({ commandTimeoutMs = defaultCommandTimeoutMs, image = defaultRunnerImage, execute = executeDockerCommand, imageBuilder = buildDockerImage }: { commandTimeoutMs?: number; image?: string; execute?: DockerCommandExecutor; imageBuilder?: DockerImageBuilder } = {}) {
    this.commandTimeoutMs = commandTimeoutMs;
    this.runnerImage = image;
    this.execute = execute;
    this.imageBuilder = imageBuilder;
  }

  async clone(build: ClaimedBuild): Promise<CommandResult> {
    const container = await this.createContainer();
    if (container.exitCode !== 0) return container;
    const clone = await this.runDocker(["exec", this.containerName!, "git", "clone", "--no-checkout", build.cloneUrl, "/workspace/repository"]);
    if (clone.exitCode !== 0) return clone;
    return this.runDocker(["exec", this.containerName!, "git", "-C", "/workspace/repository", "checkout", "--detach", build.commitSha]);
  }

  async install(): Promise<CommandResult> { return this.runInRepository(["npm", "install"]); }
  async test(): Promise<CommandResult> { return this.runInRepository(["npm", "test"]); }
  async image(build: ClaimedBuild): Promise<ImageBuildResult> {
    const imageReference = imageReferenceFor(build);
    const dockerfile = await this.runDocker(["exec", this.containerName ?? "", "sh", "-c", "printf '%s\\n' 'FROM node:22-bookworm-slim' 'WORKDIR /app' 'COPY . .' 'RUN npm install' 'EXPOSE 3000' 'CMD [\"npm\", \"start\"]' > /workspace/repository/Dockerfile"]);
    if (dockerfile.exitCode !== 0) return { ...dockerfile, imageReference };
    const result = await this.imageBuilder(this.containerName!, imageReference, this.commandTimeoutMs);
    if (result.exitCode !== 0) return { ...result, imageReference };
    const inspect = await this.runDocker(["image", "inspect", imageReference]);
    return inspect.exitCode === 0 ? { ...result, imageReference } : { exitCode: 1, output: `${result.output}${inspect.output}`, imageReference };
  }

  async deploy(build: ClaimedBuild, imageReference: string): Promise<DeploymentResult> {
    const containerName = `idp-service-${build.serviceId.replace(/[^a-zA-Z0-9_.-]/g, "")}`;
    await this.runDocker(["rm", "--force", containerName]);
    const deployed = await this.runDocker(["run", "--detach", "--name", containerName, "--restart", "unless-stopped", "--publish", "127.0.0.1::3000", imageReference]);
    if (deployed.exitCode !== 0) return { ...deployed, containerName, healthUrl: "" };
    const port = await this.runDocker(["port", containerName, "3000/tcp"]);
    const match = port.output.match(/:(\d+)\s*$/m);
    if (port.exitCode !== 0 || !match) return { exitCode: 1, output: `${deployed.output}${port.output}`, containerName, healthUrl: "" };
    return { exitCode: 0, output: `${deployed.output}${port.output}`, containerName, healthUrl: `http://127.0.0.1:${match[1]}/health` };
  }

  async health(healthUrl: string): Promise<CommandResult> {
    let output = "";
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
        output = `GET ${healthUrl} returned ${response.status}`;
        if (response.ok) return { exitCode: 0, output };
      } catch (error) { output = `GET ${healthUrl} failed: ${error instanceof Error ? error.message : "unknown error"}`; }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    return { exitCode: 1, output };
  }

  async cleanup(): Promise<void> {
    if (this.containerName) await this.runDocker(["rm", "--force", this.containerName]);
    this.containerName = undefined;
  }

  private async createContainer(): Promise<CommandResult> {
    this.containerName = `idp-build-${randomUUID()}`;
    const create = await this.runDocker([
      "create", "--name", this.containerName, "--init", "--network", "bridge",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256",
      "--memory", "1g", "--cpus", "2", "--env", "HOME=/tmp", "--env", "npm_config_cache=/tmp/npm-cache",
      this.runnerImage, "sleep", "infinity"
    ]);
    if (create.exitCode !== 0) return create;
    return this.runDocker(["start", this.containerName]);
  }

  private async runInRepository(command: string[]): Promise<CommandResult> {
    if (!this.containerName) return { exitCode: 1, output: "Build container has not been created" };
    return this.runDocker(["exec", "--workdir", "/workspace/repository", this.containerName, ...command]);
  }

  private async runDocker(args: string[]): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await this.execute("docker", args, { maxBuffer: 10 * 1024 * 1024, timeout: this.commandTimeoutMs, killSignal: "SIGTERM" });
      return { exitCode: 0, output: `${stdout}${stderr}`.slice(-100_000) };
    } catch (error) {
      const failure = error as { code?: number; killed?: boolean; stdout?: string; stderr?: string; message: string };
      const output = failure.killed ? `Command timed out after ${this.commandTimeoutMs}ms\n${failure.stdout ?? ""}${failure.stderr ?? ""}` : `${failure.stdout ?? ""}${failure.stderr ?? failure.message}`;
      return { exitCode: typeof failure.code === "number" ? failure.code : 1, output: output.slice(-100_000) };
    }
  }
}

export function imageReferenceFor(build: ClaimedBuild): string {
  const repository = build.repositoryName.toLowerCase().replace(/[^a-z0-9._/-]/g, "-");
  return `idp/${repository}:${build.commitSha}`;
}
