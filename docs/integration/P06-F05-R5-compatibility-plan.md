# R5 compatibility plan — future work

Status: planned, not implemented. Current interfaces serve R4 4.0.1 only. Explicit incompatible FHIR versions and XML are rejected. No R5 URL, conversion, certification or production readiness is asserted.

## Resource impact

| Resource | Adapter and evidence required |
| --- | --- |
| Patient | Compare R4/R5 snapshots, identifiers, deceased choices and contact/address cardinalities. Preserve organization-scoped identity and merge history; never infer patient matching. |
| Encounter | Map R5 class as CodeableConcept collection and assess EncounterHistory for historical transitions. Retain original status/version timeline rather than flattening it. [HL7 Encounter](https://hl7.org/fhir/R5/encounter.html) |
| Condition / AllergyIntolerance | Compare status, verification, onset and clinical context choices. Unknown codes and missing source facts must remain visible; no synthetic certainty. |
| Observation | Explicitly handle new triggeredBy and expanded value choices. Preserve effective time, components, units and reference-range semantics; reject unsupported attachments/references. [HL7 Observation](https://hl7.org/fhir/R5/observation.html) |
| ServiceRequest | Assess CodeableReference code and its reference targets; retain draft intent and source authority. Conversion cannot execute an order. [HL7 ServiceRequest](https://hl7.org/fhir/R5/servicerequest.html) |
| MedicationRequest | Assess CodeableReference medication, dosage and changed element choices. Preserve draft state and terminology entitlement boundaries; no prescribing execution. [HL7 MedicationRequest](https://hl7.org/fhir/R5/medicationrequest.html) |
| Subscription | Design a separate SubscriptionTopic/filter/notification-Bundle contract. Existing local inbox polling and signed partner envelopes are not R5 subscriptions. [HL7 Subscription](https://hl7.org/fhir/R5/subscription.html) |

## Upgrade sequence and release gates

1. Pin R5 package and validator versions; record a machine-readable R4/R5 element diff for all seven source resources, extension and supported legacy resources. Compare actual snapshots rather than assuming names imply compatibility. R5 contains resources with differing maturity levels. [HL7 version management](https://hl7.org/fhir/R5/versions.html)
2. Build a separate versioned adapter with explicit source provenance, supported choices and failure results. Preserve resource IDs, patient/encounter references, code-system/version, precision, unit conversion evidence, source version, correction history and recorded author/time. Unknown mandatory semantics, unmapped references and loss of clinical meaning fail closed. Never silently discard unfamiliar clinical fields. Original envelopes remain immutable.
3. Introduce independent R5 profiles, CapabilityStatement and content negotiation only after handlers exist. Retain R4 endpoints throughout a bounded compatibility period. No automatic inbound writes; previews require the same current-session/purpose/facility and clinician review controls.
4. Generate realistic synthetic cases for every resource and status, multi-component observations, unknown fields, cardinalities, invalid terminology, cross-patient references, precision/time zones and correction ordering. Prove R4-source→R5→source equality for supported facts, plus explicit loss/error behavior for unsupported cases. Validate positive/negative fixtures against pinned official R5 definitions and run authorization, idempotency, concurrency and crash tests.
5. Exercise dual-read previews with representative qualified reviewers; independently assess clinical semantics, privacy, terminology licensing, operations and downgrade/rollback. Publish exact capability claims and a migration inventory. Production enablement remains a separate authorized release decision after genuine signoffs.

Rollback keeps the authoritative source database and R4 adapter intact. Disable the prospective R5 route/adapter without rewriting source facts or deleting evidence. No R5 work is included in the current Phase 06 implementation.
