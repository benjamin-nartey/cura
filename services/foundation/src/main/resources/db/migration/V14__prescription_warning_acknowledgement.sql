ALTER TABLE rx_warnings DROP CONSTRAINT rx_warnings_status_check;
ALTER TABLE rx_warnings ADD CONSTRAINT rx_warnings_status_check CHECK (status IN ('open', 'acknowledged'));
ALTER TABLE rx_warnings ADD COLUMN acknowledged_by TEXT REFERENCES users (id);
ALTER TABLE rx_warnings ADD COLUMN acknowledged_at TIMESTAMPTZ;

UPDATE foundation_meta SET schema_version = 13 WHERE id = 1;
