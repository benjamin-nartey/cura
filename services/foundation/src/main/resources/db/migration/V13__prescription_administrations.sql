CREATE TABLE rx_administrations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES rx_orders (id),
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  administered_by TEXT NOT NULL REFERENCES users (id),
  administered_at TIMESTAMPTZ NOT NULL
);

UPDATE foundation_meta SET schema_version = 12 WHERE id = 1;
