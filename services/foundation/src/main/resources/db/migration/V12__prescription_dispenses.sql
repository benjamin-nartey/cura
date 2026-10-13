ALTER TABLE rx_orders DROP CONSTRAINT rx_orders_status_check;
ALTER TABLE rx_orders ADD CONSTRAINT rx_orders_status_check CHECK (status IN ('proposed', 'active', 'dispensed'));

CREATE TABLE rx_dispenses (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rx_orders (id),
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 90),
  dispensed_by TEXT NOT NULL REFERENCES users (id),
  dispensed_at TIMESTAMPTZ NOT NULL
);

UPDATE foundation_meta SET schema_version = 11 WHERE id = 1;
