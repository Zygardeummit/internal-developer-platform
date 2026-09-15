INSERT INTO repositories (id, github_full_name, clone_url, default_branch)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'example/internal-service',
  'https://github.com/example/internal-service.git',
  'main'
)
ON CONFLICT (github_full_name) DO NOTHING;

INSERT INTO builds (id, repository_id, commit_sha, branch, status, image_reference, started_at, completed_at)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '8f3c9b23ec2d4e01a84ff10d8b514507a4c1d912',
  'main',
  'succeeded',
  'internal-service:8f3c9b2',
  now() - interval '4 minutes',
  now() - interval '2 minutes'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO build_steps (id, build_id, position, name, status, started_at, completed_at)
VALUES
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 1, 'build', 'succeeded', now() - interval '4 minutes', now() - interval '3 minutes'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 2, 'test', 'succeeded', now() - interval '3 minutes', now() - interval '2 minutes')
ON CONFLICT (id) DO NOTHING;

INSERT INTO services (id, repository_id, name, environment, health_status, health_checked_at)
VALUES (
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000001',
  'internal-service',
  'development',
  'healthy',
  now()
)
ON CONFLICT (repository_id, name, environment) DO NOTHING;

INSERT INTO deployments (id, build_id, service_id, status, image_reference, version, started_at, completed_at)
VALUES (
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000005',
  'succeeded',
  'internal-service:8f3c9b2',
  '8f3c9b2',
  now() - interval '2 minutes',
  now() - interval '1 minute'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO logs (id, build_step_id, level, message, attributes)
VALUES (
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000004',
  'info',
  'Development seed test step completed.',
  '{"durationSeconds": 60}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO logs (id, deployment_id, level, message, attributes)
VALUES (
  '00000000-0000-4000-8000-000000000008',
  '00000000-0000-4000-8000-000000000006',
  'info',
  'Development seed deployment completed.',
  '{"environment": "development"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
