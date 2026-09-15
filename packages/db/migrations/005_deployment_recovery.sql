ALTER TABLE builds ADD COLUMN lease_expires_at timestamptz;
CREATE INDEX builds_running_lease_idx ON builds (lease_expires_at) WHERE status = 'running';

ALTER TABLE services ADD COLUMN container_name text;
ALTER TABLE services ADD COLUMN health_url text;

INSERT INTO services (repository_id, name, environment)
SELECT id, split_part(github_full_name, '/', 2), 'development' FROM repositories
ON CONFLICT (repository_id, name, environment) DO NOTHING;
