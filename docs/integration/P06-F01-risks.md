# P06-F01 simulation risk controls

Conservative engineering risk class: C. This is an implementation control record, not a qualified clinical review or production signoff.

| Hazard | Implemented control | Verification |
| --- | --- | --- |
| Draft/request becomes an executable clinical instruction | Source executable/transmission state checked; ServiceRequest and MedicationRequest intent fixed to proposal; comparison cannot write or deliver | Domain intent rejection, browser API tests, official executable-ServiceRequest negative case |
| Invalidated condition still asserts a resolved diagnosis | R4 con-5 omits clinicalStatus for entered-in-error; con-4 also requires omission of abatement. Original resolution remains losslessly in source context. Inconsistent active-plus-resolution sources fail closed | Actual resolve → entered-in-error simulation and official lifecycle bundle |
| Merged identity appears active or loses its survivor | Active/inactive boolean follows registration status; merged patient has inactive state and replaced-by reference; original identity remains stable | Patient state and inverse-mapping domain oracles |
| Duplicate MRN merges unrelated organizations | Identifier namespace and FHIR IDs include tenant; no identifier-only lookup or automatic patient matching | Two persisted tenants with ACC-4401; distinct identifiers/IDs and cross-tenant denial |
| Stale or forged metadata authorizes a source change | Fresh authoritative read and full source-context fingerprint check; immutable references/coding/unit/intent; all comparisons return applied=false | Actual corrected observation invalidates older context; forged context 409; repeat/reopen tests |
| Unknown clinical facts disappear on import | Exact supported-profile re-projection; unsupported fields/modifiers/version semantics rejected; no import mutation exists in this feature | Unknown-property, modifier, namespace and reference tests |
| Resource/exception leaks clinical data outside authorized scope | Active account/facility/source permissions and patient registration checks before returning facts; no-store, no CORS, same-origin transport; generic storage-failure OperationOutcome; bounded JSON | Tenant/role/suspension tests, HTTP redaction and transport tests, browser anonymous/origin checks |
| Synthetic codes are mistaken for licensed terminology | Own source URNs, original coding/version provenance, remote terminology server disabled, unfiltered unknown-system warnings retained | Official reports and coding/unit oracle assertions |
| Dependency outage produces fake success or a partial clinical action | Existing dependency gates fail closed; cancellation/retry/reload; no clinical mutation/dispatch; access/audit bookkeeping only | Source outage/recovery, sandbox closure, file-backed reopen, browser network retry |

Residual boundaries: structural/profile validity does not establish treatment correctness, clinical acceptability, terminological equivalence or permission to release data externally. Source-only context is a CuraSphere contract, not a general partner interchange guarantee. Profiles are draft/experimental. F02–F05 and qualified production reviews remain separate; this feature does not claim them complete.
