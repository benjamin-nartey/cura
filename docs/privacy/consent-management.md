# Consent management

P03-F02 stores purpose-specific consent for synthetic subjects. It is experimental local development. Formal Phase 03 remains NOT AUTHORIZED. No production jurisdiction is selected. The configured policy context is `synthetic-development` version 1.

## Model

Schema 34 adds subjects, authorities, directives, immutable versions, withdrawals, queued dispatches, and a local sink. Akua Boateng is the synthetic subject `sub_akua_boateng` at Accra Central Medical Centre. She is not a Phase 04 patient record.

A directive moves from `pending_verification` to `active` only after a recorded authority is verified. `draft` is not used for a submitted record. `refused`, `withdrawn`, `expired`, and `superseded` do not authorize new processing. A withdrawn directive cannot be activated again.

## Enforcement

`evaluateConsent` checks the server policy for communication, outbound sharing, and research. Missing consent denies those actions. A communication grant does not authorize research. Consent does not override RBAC. `authorize` calls the consent gate only after an ordinary allow, and only for the three consent-dependent actions.

Queued reminders are checked again at `dispatchConsentJob`. Withdrawal marks queued jobs blocked inside the same transaction that writes the new version. A message already written to `consent_sink` stays there as historical evidence.

## Authority

Self acknowledgment uses `evidence_self_ack`. A guardian uses `evidence_guardian_order`. A surname match is rejected. A clinician is not treated as a grantor because they can see a record.

## API

- `POST /api/consents`
- `GET /api/consents/list`
- `GET /api/consents/{id}`
- `POST /api/consents/{id}/verify`
- `POST /api/consents/{id}/activate`
- `POST /api/consents/{id}/withdraw`
- `POST /api/consents/{id}/supersede`
- `POST /api/consents/{id}/queue`
- `POST /api/consents/dispatch`
- `POST /api/consents/evaluate`

The UI is `/consent`, `/consent/directory`, `/consent/new`, `/consent/{id}`, `/consent/{id}/withdraw`, `/consent/{id}/history`, and `/consent/inspect`. The inspector is refused when `CURASPHERE_ENV` is production or staging.

## FHIR

The stored fields can later map to FHIR R4 Consent status, scope, category, patient, performer, policy, purpose, period, and provision. That mapping is not implemented, and this store is not a claim of FHIR conformance or of legal validity in Ghana or Europe.

## Rollback

`CONSENT_ROLLBACK` drops the consent tables, removes schema version 34, and records version 33. The next database open applies version 34 again.

## Runbook

1. If evaluation returns `consent-unavailable`, restore `consent_controls.dependency` to `available` and retry. Do not dispatch from a stale allow.
2. A failed withdrawal leaves the directive active. Retry with the current version.
3. Withdrawal deletes the consent cache for that subject. A cache row whose version does not match the directive is ignored.
4. Queued jobs stay `queued` until dispatch. Dispatch re-reads consent. Restart does not deliver a blocked job.
5. Withdrawal and dispatch each take a write transaction. The dispatch that starts after withdrawal commits is blocked.
6. Version rows reject update and delete. If a version hash chain in the access ledger breaks, stop processing and investigate before repairing.
7. Rejected authority evidence stays unverified. Do not activate that directive.
8. Consent changes append to the P03-F01 ledger. A missing ledger row means the write did not commit.
9. If migration to version 34 fails, restore the database from the last backup taken at version 33 and retry the upgrade.
10. Deployment scripts still refuse the experimental override. Do not publish this feature.
