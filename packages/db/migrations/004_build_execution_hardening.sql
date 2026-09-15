ALTER TABLE builds
  ADD COLUMN retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0);

CREATE INDEX builds_status_retry_created_at_idx ON builds (status, retry_count, created_at DESC);
