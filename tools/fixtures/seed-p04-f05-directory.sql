-- Local SYNTHETIC persona only, corresponding to seedBillingPrimitives.
-- Refuse to seed a directory without the existing synthetic organization/facility.
INSERT INTO users (id, organization_id, facility_id, display_name, role)
SELECT 'usr_gh_billing', 'org_demo_gh', 'fac_gh_accra', 'Aba Mensah', 'admin'
WHERE EXISTS (SELECT 1 FROM organizations WHERE id = 'org_demo_gh')
  AND EXISTS (SELECT 1 FROM facilities WHERE id = 'fac_gh_accra' AND organization_id = 'org_demo_gh')
ON CONFLICT (id) DO NOTHING;
