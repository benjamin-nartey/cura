# Operational copy and authoritative dashboard data

## Changes

Removed the global engineering notice from the layout. The dashboard no longer carries an engineering banner. Account & workspace contains the environment details, and clinical charts continue to identify simulation records. Production safeguards, governance records, external transmission restrictions, and synthetic-data flags are unchanged.

Revised user-facing copy across account, patient directory, billing, encounters, clinical entry, work coordination, consent, privacy, audit, facility, and operations pages. Actions now use operational labels such as Create charge and Refresh overview. Missing records remain empty states. Unconnected services, non-executable medication drafts, pending policy approval, and unverified credentials remain accurately described; these are not represented as live capabilities.

The dashboard now reads the current chart database, using the same facility registrations as the patient directory and current visit_encounters, source_observations, clinical source, work, and billing tables. It no longer overwrites local patient totals using the separate foundation directory service. Metric access follows effective permissions; suspended accounts are denied. The auditor view retains organization-scoped audit records. Dashboard patient links open the unified chart.

Removed the mixed-unit headline percentage and the notification count obtained from the separate service. Marketing artwork uses generic illustrative headings rather than a named fictional patient.

## Data boundary

The figures are actual persisted records in the isolated simulation workspace. No real patient data was imported, no hardcoded success counts were introduced, no records were deleted, and no unavailable integration was represented as connected. Real clinical data and production use remain outside the authorized simulation scope.

## Verification

Domain suite: 393/393 passed. Full workspace TypeScript and lint passed. New tests check directory/count consistency, current encounter source, correct chart links, foreign-tenant exclusion, clinical/financial separation, and suspended-account denial. Browser/build evidence is recorded locally under artifacts/governance-v2/premium-ui/.

Final verification: production build passed; 4/4 production browser tests passed, including nonzero persisted patient totals and absence of the global notice; 10/10 governance safety tests passed. Axe checks reported zero violations on the tested landing, login, dashboard, clinical chart, and charge pages.
