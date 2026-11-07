-- Local synthetic directory personas. Idempotent. No passwords.
INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES
  ('usr_gh_privacy', 'org_demo_gh', 'fac_gh_accra', 'Kojo Asante', 'auditor'),
  ('usr_gh_records', 'org_demo_gh', 'fac_gh_accra', 'Adjoa Frimpong', 'auditor'),
  ('usr_gh_legal', 'org_demo_gh', 'fac_gh_accra', 'Yaw Owusu', 'auditor'),
  ('usr_gh_reviewer', 'org_demo_gh', NULL, 'Esi Boateng', 'auditor'),
  ('usr_gh_invite', 'org_demo_gh', NULL, 'Efua Mensah', 'nurse')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES
  ('om_org_demo_gh_usr_gh_privacy', 'org_demo_gh', 'usr_gh_privacy', 'active', 1),
  ('om_org_demo_gh_usr_gh_records', 'org_demo_gh', 'usr_gh_records', 'active', 1),
  ('om_org_demo_gh_usr_gh_legal', 'org_demo_gh', 'usr_gh_legal', 'active', 1),
  ('om_org_demo_gh_usr_gh_reviewer', 'org_demo_gh', 'usr_gh_reviewer', 'active', 1),
  ('om_org_demo_gh_usr_gh_invite', 'org_demo_gh', 'usr_gh_invite', 'revoked', 1)
ON CONFLICT (organization_id, user_id) DO NOTHING;

INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES
  ('fm_fac_gh_accra_usr_gh_privacy', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_privacy', 'privacy-officer', 'active', 1),
  ('fm_fac_gh_accra_usr_gh_records', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_records', 'records-manager', 'active', 1),
  ('fm_fac_gh_accra_usr_gh_legal', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_legal', 'legal-hold-admin', 'active', 1)
ON CONFLICT (facility_id, user_id) DO NOTHING;
