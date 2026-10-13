INSERT INTO organizations (id, name) VALUES
  ('org_harborlight', 'Harborlight Health'),
  ('org_northwind', 'Northwind Medical');

INSERT INTO facilities (id, organization_id, name) VALUES
  ('fac_riverside', 'org_harborlight', 'Riverside Clinic'),
  ('fac_east', 'org_harborlight', 'East Annex'),
  ('fac_lakeside', 'org_northwind', 'Lakeside Hospital');

INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES
  ('usr_amira', 'org_harborlight', 'fac_riverside', 'Amira Solano', 'clinician'),
  ('usr_jordan', 'org_harborlight', 'fac_riverside', 'Jordan Hale', 'nurse'),
  ('usr_lea', 'org_harborlight', 'fac_east', 'Lea Okonkwo', 'clinician'),
  ('usr_priya', 'org_harborlight', NULL, 'Priya Raman', 'auditor'),
  ('usr_nabil', 'org_harborlight', NULL, 'Nabil Rahman', 'auditor'),
  ('usr_admin', 'org_harborlight', NULL, 'Harborlight Admin', 'admin'),
  ('usr_evan', 'org_northwind', 'fac_lakeside', 'Evan Cho', 'clinician');
