# P06-F05 architecture and operations

The pure FHIR package owns two draft CapabilityStatements, two custom legacy OperationDefinitions and the boundary catalog. Domain services gate publication to the configured local synthetic sandbox and whitelist twelve cloned artifacts: eight existing profiles plus those four descriptors. Source mapping version is 1.0.1; profile and conformance surface versions are 1.0.0. The latter identifies this conformance component, not a production platform release.

The legacy cookie-based chart and current-source scoped SMART read endpoint remain separate. Only the latter advertises restricted public-client S256 PKCE patient/type read authorization. Its seven resource reads expose base R4 projections, so private source profiles are deliberately absent from supportedProfile claims. Signed JSON partner transport, reviewed batches and recovery are documented custom contracts, not generic FHIR transactions, HL7 Bulk Data or R5 SubscriptionTopic. Capability claims describe implemented behavior, following [HL7 CapabilityStatement](https://hl7.org/fhir/R4/capabilitystatement.html).

## Published local interfaces

- `/interop/conformance`: staff workbench with previews, downloads, hashes, restriction matrix and R5 planning context.
- `/api/integrations/conformance`: PHI-free public catalog in the permitted local environment.
- `/api/integrations/conformance/artifacts/{id}`: whitelist artifact retrieval.
- `/api/fhir/r4/metadata`: legacy chart declaration.
- `/api/integrations/r4/smart/metadata`: scoped source-read declaration.

URLs derive from validated configured origin, never incoming Host. Canonical https://curasphere.local identifiers identify logical profiles; catalog download URLs identify the running local deployment. They do not claim public hosting. JSON hashes and ETags describe exact serialized bytes. Conditional responses occur only after sandbox gating; responses are no-store/nosniff and unknown errors are sanitized. Metadata needs no database access, session or patient query.

R4 routes reject explicit R5/R4B/XML negotiation with 406 or incompatible body media with 415. Default JSON remains compatible, including legacy export NDJSON polling. Failures on FHIR endpoints use OperationOutcome. Unsupported R5 routes return 404.

## Operator procedure

Run `npm run conformance:generate` after changing source descriptors or draft profiles, then `npm run conformance:test`. Review generated changes; never hand-edit bundled profiles or validation fixture bytes. CI checks drift and executes the official validation job. For a separate local validator evidence directory set `CURASPHERE_FHIR_VALIDATION_RUN=P06-F05-validator` and run `npm run fhir:validate` with the installed integrity-checked validator/Java. Retain summary, logs, raw reports and expected-invalid cases. This performs offline structural/profile validation, not licensed terminology verification.

Verify the catalog, both metadata endpoints and actual scoped reads after changing claims. Do not publish unsupported search/write/export capabilities. For rollback revert conformance code/artifacts together and rebuild; no schema migration or clinical record rollback is needed. Keep existing transport/batch and clinical evidence intact. Do not disable governance gates to make metadata accessible outside this sandbox.
