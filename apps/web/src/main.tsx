import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Build, BuildStep, Deployment, LogEntry, Repository, Service } from "@idp/domain";
import "./styles.css";

interface OperationsData {
  repositories: Repository[];
  builds: Build[];
  buildSteps: BuildStep[];
  deployments: Deployment[];
  services: Service[];
  logs: LogEntry[];
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
async function postAction(path: string): Promise<void> {
  const token = window.prompt("API token");
  if (!token) return;
  const response = await fetch(path, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Action failed (${response.status})`);
}

async function loadOperations(): Promise<OperationsData> {
  const [repositories, builds, deployments, services, logs] = await Promise.all([
    getJson<Repository[]>("/api/repositories"), getJson<Build[]>("/api/builds"),
    getJson<Deployment[]>("/api/deployments"), getJson<Service[]>("/api/services"), getJson<LogEntry[]>("/api/logs")
  ]);
  const steps = await Promise.all(builds.map((build) => getJson<BuildStep[]>(`/api/builds/${build.id}/steps`)));
  return { repositories, builds, buildSteps: steps.flat(), deployments, services, logs };
}

function Status({ value }: { value: string }) { return <span className={`badge ${value}`}>{value}</span>; }

function App() {
  const [data, setData] = useState<OperationsData>();
  const [error, setError] = useState<string>();

  const refresh = () => loadOperations().then(setData).catch(() => setError("Operations data is unavailable. Start PostgreSQL, run migrations and seed data, then start the API."));
  useEffect(() => { void refresh(); }, []);

  if (error) return <main><p className="eyebrow">Operations dashboard</p><h1>Unavailable</h1><p className="error">{error}</p></main>;
  if (!data) return <main><p className="eyebrow">Operations dashboard</p><h1>Loading operational status…</h1></main>;

  return (
    <main>
      <p className="eyebrow">Operations dashboard</p>
      <h1>Internal Developer Platform</h1>
      <div className="grid">
        <section><h2>Repositories</h2>{data.repositories.map((repository) => <p key={repository.id}><strong>{repository.githubFullName}</strong><br />{repository.defaultBranch}</p>)}</section>
        <section><h2>Services</h2>{data.services.map((service) => <p key={service.id}><strong>{service.name}</strong> · {service.environment}<br /><Status value={service.healthStatus} /> {service.healthUrl ?? "not deployed"}</p>)}</section>
        <section><h2>Recent builds</h2>{data.builds.map((build) => <p key={build.id}><strong>{build.repositoryName}</strong> · {build.commitSha.slice(0, 7)}<br /><Status value={build.status} /><br />image: {build.imageReference ?? "pending"}<br />{build.status === "failed" && <button onClick={() => void postAction(`/api/builds/${build.id}/retry`).then(refresh).catch((error: Error) => setError(error.message))}>Retry</button>} {build.status === "succeeded" && <button onClick={() => void postAction(`/api/builds/${build.id}/redeploy`).then(refresh).catch((error: Error) => setError(error.message))}>Redeploy</button>}</p>)}</section>
        <section><h2>Build steps</h2>{data.buildSteps.map((step) => <p key={step.id}>{step.position}. <strong>{step.name}</strong> <Status value={step.status} /></p>)}</section>
        <section><h2>Deployments</h2>{data.deployments.map((deployment) => <p key={deployment.id}><strong>{deployment.serviceName}</strong> · {deployment.version}<br /><Status value={deployment.status} /></p>)}</section>
        <section><h2>Recent logs</h2>{data.logs.map((log) => <p key={log.id}><Status value={log.level} /> {log.message}</p>)}</section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
