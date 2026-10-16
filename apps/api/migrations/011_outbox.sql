-- 011_outbox.sql

-- Add attempts column
ALTER TABLE outbox_events ADD COLUMN attempts INT NOT NULL DEFAULT 0;

-- Existing rows that were marked as 'PROCESSED' (by mock worker) will be renamed to 'COMPLETED'
UPDATE outbox_events SET status = 'COMPLETED' WHERE status = 'PROCESSED';

-- We alter the constraint on status if there is one. Since the previous table definition didn't enforce check constraints:
-- "status VARCHAR NOT NULL DEFAULT 'PENDING'"
-- We can add a CHECK constraint to enforce valid statuses going forward.
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));
