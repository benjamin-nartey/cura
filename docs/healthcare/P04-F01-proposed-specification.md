# P04-F01 proposed specification — patient and practitioner master records

This specification is not approved for implementation. Phase 04 remains NOT_STARTED. The experimental runner remains `permitted_feature=none`.

## Intent

Give each synthetic person one chart identity inside an organization, and give each synthetic practitioner a clinical profile bound to an existing directory user. Surface possible duplicates for a person to decide. A merge keeps the losing identifier and the versions that existed before the decision.

Evidence the original feature asks for: a duplicate candidate is shown for a human decision, and a merge retains provenance.

## Out of scope

Appointments, encounters beyond the existing table, new clinical observations, orders, referrals, charges, AI matching, and production identity proofing. No real patient data.

## Data

Extend `patients`. Do not create a second patient table. Add only the missing structures:

- Identifier rows: type, value, organization, facility, status, and a unique constraint that does not collide across tenants.
- Contact rows: use, system, and value, classified as PII and kept out of ordinary telemetry by the P03-F05 allowlist.
- Facility relationship history when a person is registered at more than one facility in the same organization.
- Duplicate candidates: two patient ids, match reason, score band, status `open`, `rejected`, or `merged`, and the actor who decided.
- Merge history: survivor id, retired id, decision actor, source versions, and the identifier values that moved. The retired row stays readable as `merged` and is not deleted.
- Provenance on each change: author, recorded time, version, and a reason code. Corrections append a version. They do not update the old version in place.

Practitioner profile: one row per directory user who is allowed a clinical role, with organization, facility memberships already stored, qualification text that is synthetic, and a version. The profile does not create a second login and does not grant a role by itself.

Ghana and Europe demo organizations need synthetic patients created by this feature's seed, linked with explicit ids to any consent or DSAR subject they represent. Harborlight and Northwind rows stay fixtures until a migration states their ownership. They are not silently promoted to source records.

## Backend

Transactional commands, each with an idempotency key and an expected version:

- Register patient. Denied roles write a ledger denial.
- Read and search inside the caller's organization and facility.
- Add or retire an identifier or contact.
- Open a duplicate candidate when name and birth date match inside the organization. The same name in another organization is a separate person and is recorded as a cross-tenant non-match, not a merge.
- Accept or reject a candidate. Accept requires a second permission that ordinary registration does not include. The writer and the approver are different users.
- Correct demographics. A stale version returns conflict and leaves the stored version unchanged.

Every success and denial appends the access ledger through the existing audit helper. Contact values and free-text reasons do not enter the ledger metadata or ordinary logs. Failed merges roll back the transaction. The candidate stays `open`.

## UI

Role-aware screens on the existing shell:

- Patient directory and search, including empty and no-result states.
- Registration, with field errors.
- Patient detail, identifiers, contacts, and version history.
- Practitioner directory and detail.
- Duplicate review with both records visible and an explicit confirm step.
- Merge result showing survivor, retired id, and who approved.
- Forbidden, signed-out, and conflict states. Severity and status are labeled in text.

A receptionist may register only if the existing permission already allows it. A clinician may read the chart in their facility. Nobody merges from the registration form alone.

## Tests to write later

Synthetic Accra and Northbridge patients. Same name and birth date inside Accra produces one open candidate. The same name at Northbridge does not merge into the Accra row. An unauthorized user receives a denial and a ledger row. Two concurrent corrections produce one success and one conflict. A failed merge leaves both patients active. History can be read back in order. Browser coverage includes registration, the duplicate review, the denial, and the signed-out return to the directory.

## Acceptance still required

This document does not mark P04-F01 accepted. Acceptance still needs the micro-cycle: persistence, API, UI, permissions, audit, synthetic scenario, failure tests, rollback, and a human decision on the duplicate. Formal governance signatures remain unsatisfied.
