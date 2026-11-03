# Phase 04 architecture and dependency plan

This is a planning record. Phase 04 remains NOT_STARTED. It does not authorize implementation.

Original scope, from the engineering specification: patient, practitioner, appointment, encounter, condition, allergy, observation, medication, orders, care plan, referral, and billing primitives, with a normalized model, transactional APIs, versioned contracts, optimistic concurrency, and idempotency keys.

Original exit criteria, all still unproven:

- No AI dependency.
- Source records are immutable or versioned where required.
- Clinical data ownership boundaries are documented.

Prescribed feature order: P04-F01 master records, P04-F02 appointments and encounters, P04-F03 clinical source entries, P04-F04 orders, care plans, and referrals, P04-F05 billing primitives and chart UX. One feature is completed before the next. The phase acceptance scenario is a synthetic outpatient hypertension follow-up with a duplicate name, a missed appointment, a cancelled order, a corrected vital, and concurrent edits in two facilities.

## What already exists

The chart SQLite schema already has `patients`, `conditions`, `allergies`, `medications`, `encounters`, and `observations`. `createPatient` checks authorization, takes an idempotency key, writes version 1, and calls `writeAudit`, which appends the access ledger. Patient search is organization and facility scoped. There is no `practitioners` table. Clinical staff are `users` plus organization and facility memberships. There is no duplicate-candidate table, merge history, contact table, or identifier table beyond a unique `(organization_id, mrn)`.

The live chart has 13 Harborlight patients and 3 Northwind patients. Demo Ghana and demo Europe have workforce users and no patient rows. Those patient rows are synthetic fixtures. They are not authoritative clinical source records for Phase 04.

Consent subjects, DSAR subjects, and chart patients are different tables. Akua Boateng is a consent subject. The bulk-export cohort is a privacy subject. A later master-record design has to link those identities on purpose. It must not treat a name match as the same person.

## Ownership

The chart domain owns source clinical facts for the local experimental stack. Foundation Postgres owns directory authentication and membership. Projections, search copies, analytics, and model outputs stay derived and must store the source id and version. The AI gateway is not a writer of clinical source records. Phase 04 source writes do not call a model.

Tenant and facility scope stay on every source row. Authorization continues to use `authorize()` and the existing permission grants. A consent allow does not create a permission the role lacks. Withdrawn consent still blocks the purposes P03-F02 already blocks. Retention and legal hold still apply before disposal. DSAR correction, when it arrives inside a later feature, amends through a versioned source write and does not rewrite the ledger.

## Dependency order

P04-F01 extends the existing patient row and adds the practitioner profile, identifiers, contacts, match candidates, and merge history. P04-F02 should extend the existing encounter version column rather than invent a second encounter table, and it adds the appointment state machine the current encounter statuses do not cover. P04-F03 versions the existing condition, allergy, medication, and observation rows instead of replacing them. P04-F04 adds orders, care plans, and referrals, which are not present. P04-F05 adds charges with a permission separate from clinical write, and it uses the chart screens already in the web app.

FHIR R4 names are a planning vocabulary. Existing condition rows store an ICD-10-CM system URL. That is not a FHIR conformance claim. A mapping table can wait until a feature needs an external exchange.

## Clinical boundary

No feature in this phase makes a diagnosis, recommends a treatment, or merges two people without a human decision. Duplicate resolution stores who decided, the source versions, and the losing identifier. An automated job may suggest a candidate. It may not overwrite the surviving identity.
