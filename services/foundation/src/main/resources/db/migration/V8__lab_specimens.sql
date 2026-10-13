ALTER TABLE lab_orders DROP CONSTRAINT lab_orders_status_check;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_status_check CHECK (status IN ('requested', 'collected'));

CREATE TABLE lab_specimens (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES lab_orders (id),
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  collected_by TEXT NOT NULL REFERENCES users (id),
  collected_at TIMESTAMPTZ NOT NULL
);

UPDATE foundation_meta SET schema_version = 7 WHERE id = 1;
