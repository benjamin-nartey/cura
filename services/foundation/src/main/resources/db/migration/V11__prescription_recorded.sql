ALTER TABLE rx_orders DROP CONSTRAINT rx_orders_status_check;
ALTER TABLE rx_orders ADD CONSTRAINT rx_orders_status_check CHECK (status IN ('proposed', 'active'));
ALTER TABLE rx_orders ADD COLUMN medication_id TEXT REFERENCES medications (id);

UPDATE foundation_meta SET schema_version = 10 WHERE id = 1;
