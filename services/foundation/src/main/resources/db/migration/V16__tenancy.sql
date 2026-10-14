ALTER TABLE organizations
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));

ALTER TABLE facilities
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled'));

ALTER TABLE sessions
  ADD COLUMN active_organization_id TEXT,
  ADD COLUMN active_facility_id TEXT,
  ADD COLUMN context_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  version INTEGER NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE facility_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  facility_id TEXT NOT NULL REFERENCES facilities (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  role TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  version INTEGER NOT NULL,
  UNIQUE (facility_id, user_id)
);

CREATE TABLE service_principals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  UNIQUE (organization_id, name)
);

CREATE TABLE tenancy_controls (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dependency TEXT NOT NULL
);

INSERT INTO organization_memberships (id, organization_id, user_id, status, version)
SELECT 'om_' || organization_id || '_' || id, organization_id, id, 'active', 1
FROM users
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version)
SELECT 'fm_' || facility_id || '_' || id, organization_id, facility_id, id, role, 'active', 1
FROM users
WHERE facility_id IS NOT NULL
ON CONFLICT (facility_id, user_id) DO NOTHING;

INSERT INTO organizations (id, name, status) VALUES
  ('org_demo_gh', 'DEMO_GH', 'active'),
  ('org_demo_eu', 'DEMO_EU', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO facilities (id, organization_id, name, status) VALUES
  ('fac_gh_accra', 'org_demo_gh', 'Accra Central Medical Centre', 'active'),
  ('fac_gh_east_legon', 'org_demo_gh', 'East Legon Family Clinic', 'active'),
  ('fac_gh_madina', 'org_demo_gh', 'Madina Diagnostic Centre', 'active'),
  ('fac_eu_northbridge', 'org_demo_eu', 'Northbridge General Hospital', 'active'),
  ('fac_eu_riverside', 'org_demo_eu', 'Riverside Specialist Clinic', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES
  ('usr_gh_admin', 'org_demo_gh', 'fac_gh_accra', 'Ama Mensah', 'admin'),
  ('usr_gh_doctor', 'org_demo_gh', 'fac_gh_accra', 'Kwame Boateng', 'clinician'),
  ('usr_gh_nurse', 'org_demo_gh', 'fac_gh_accra', 'Akosua Owusu', 'nurse'),
  ('usr_gh_reception', 'org_demo_gh', 'fac_gh_east_legon', 'Yaa Asare', 'nurse'),
  ('usr_gh_lab', 'org_demo_gh', 'fac_gh_madina', 'Kojo Mensah', 'clinician'),
  ('usr_eu_admin', 'org_demo_eu', 'fac_eu_northbridge', 'Marta Keller', 'admin'),
  ('usr_eu_doctor', 'org_demo_eu', 'fac_eu_northbridge', 'Noah Keller', 'clinician'),
  ('usr_eu_nurse', 'org_demo_eu', 'fac_eu_riverside', 'Ida Keller', 'nurse')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES
  ('om_org_demo_gh_usr_gh_admin', 'org_demo_gh', 'usr_gh_admin', 'active', 1),
  ('om_org_demo_gh_usr_gh_doctor', 'org_demo_gh', 'usr_gh_doctor', 'active', 1),
  ('om_org_demo_gh_usr_gh_nurse', 'org_demo_gh', 'usr_gh_nurse', 'active', 1),
  ('om_org_demo_gh_usr_gh_reception', 'org_demo_gh', 'usr_gh_reception', 'active', 1),
  ('om_org_demo_gh_usr_gh_lab', 'org_demo_gh', 'usr_gh_lab', 'active', 1),
  ('om_org_demo_eu_usr_eu_admin', 'org_demo_eu', 'usr_eu_admin', 'active', 1),
  ('om_org_demo_eu_usr_eu_doctor', 'org_demo_eu', 'usr_eu_doctor', 'active', 1),
  ('om_org_demo_eu_usr_eu_nurse', 'org_demo_eu', 'usr_eu_nurse', 'active', 1)
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES
  ('fm_fac_gh_accra_usr_gh_admin', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_admin', 'organization-administrator', 'active', 1),
  ('fm_fac_gh_accra_usr_gh_doctor', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_doctor', 'doctor', 'active', 1),
  ('fm_fac_gh_accra_usr_gh_nurse', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_nurse', 'nurse', 'active', 1),
  ('fm_fac_gh_east_legon_usr_gh_nurse', 'org_demo_gh', 'fac_gh_east_legon', 'usr_gh_nurse', 'nurse', 'active', 1),
  ('fm_fac_gh_east_legon_usr_gh_reception', 'org_demo_gh', 'fac_gh_east_legon', 'usr_gh_reception', 'receptionist', 'active', 1),
  ('fm_fac_gh_madina_usr_gh_lab', 'org_demo_gh', 'fac_gh_madina', 'usr_gh_lab', 'laboratory', 'active', 1),
  ('fm_fac_eu_northbridge_usr_eu_admin', 'org_demo_eu', 'fac_eu_northbridge', 'usr_eu_admin', 'organization-administrator', 'active', 1),
  ('fm_fac_eu_northbridge_usr_eu_doctor', 'org_demo_eu', 'fac_eu_northbridge', 'usr_eu_doctor', 'doctor', 'active', 1),
  ('fm_fac_eu_riverside_usr_eu_nurse', 'org_demo_eu', 'fac_eu_riverside', 'usr_eu_nurse', 'nurse', 'active', 1)
ON CONFLICT (facility_id, user_id) DO NOTHING;

INSERT INTO service_principals (id, organization_id, name, scope, status) VALUES
  ('svc_gh_sync', 'org_demo_gh', 'directory-sync', 'organization:read', 'active'),
  ('svc_eu_sync', 'org_demo_eu', 'directory-sync', 'organization:read', 'active')
ON CONFLICT (id) DO NOTHING;

UPDATE foundation_meta SET schema_version = 15 WHERE id = 1;
