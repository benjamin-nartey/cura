# ADR 0087 — owner-scoped immutable source ingestion

Status: experimental local decision; qualified architecture/privacy/clinical/licensing review pending.

P09-F01 stores immutable claims and generic citations. P09-F02 must distinguish human support, contradiction and insufficiency annotations without treating them as clinical verification or replacing authoritative source records.

Decision: additive schema 59 stores plain-text owner-provided synthetic documents, immutable annotated edges to specific claim revisions, and scoped command receipts. Reuse source-owned inventory and canonical effective times; map known local source IDs through the existing FHIR R4 preview. Do not fetch remote URLs or accept arbitrary caller-supplied FHIR provenance. An imported document is an immutable local evidence artifact, not a clinical chart entry. Missing effective time remains unknown. A replacement document gets a new ID; no content overwrite is introduced.

All sources and inspections recheck live Foundation authority at HTTP and existing source permissions in domain. Documents additionally bind exact actor, facility, patient, treatment purpose and coverage. Context hashes include current owned document identities/checksums. Source/claim changes withhold prior edge content. Append-only transactions serialize receipt/edge uniqueness and event/audit writes. Read-side freshness is a safety boundary; F04 event-driven invalidation remains unimplemented.

Consequences: annotations are human assertions, not sufficiency calculations. No verification state can be elevated. Native navigates to the independently authenticated web workspace. Imported documents are not added to FHIR/DSAR exports; qualified retention/export decisions block real-data release. Operational rollback must keep a schema-59-compatible backend and retain immutable data; fixture-only reversal is explicitly unsafe for operational use.
