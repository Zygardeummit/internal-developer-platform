ALTER TABLE builds ADD COLUMN commit_message text;

CREATE TABLE github_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
  build_id uuid REFERENCES builds(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX github_webhook_deliveries_repository_received_idx
  ON github_webhook_deliveries (repository_id, received_at DESC);
