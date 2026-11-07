# P06-F03 risks and boundaries

| Hazard | Control / verification required |
|---|---|
| Duplicate or concurrent messages create duplicate clinical records | Persistent message hashes/aliases, accepted source-version uniqueness, atomic reviewed head/source writes, real two-process review race |
| Vendor identifiers merge different patients | Explicit immutable connection-scoped patient/encounter pairs; two vendors reuse MRN-100 for different local patients |
| Malformed data or unknown fields disappear | Strict bounded JSON contract, duplicate-key rejection, quarantine and immutable body |
| Source correction overwrites local edits | Contiguous external versions, immutable identity, local source-version CAS and existing append-only source history |
| Signature replay or tampering | Exact raw-byte HMAC including message/connection/timestamp, five-minute clock window, persistent idempotency beyond that window |
| Partner identity is mistaken for clinical authority | Signed receipt creates no clinical write; current clinician approval and authoritative service gates required |
| Unreviewed external sharing / legal consent | Local synthetic gate remains mandatory; subscription is simulation workforce authorization only, not patient consent or legal permission |
| Outbound privacy leak | Patient subscription, immutable source snapshot without transport/proprietary context, live original session/patient/source gate every attempt; no session ID in browser DTO |
| SSRF, redirects, cookie forwarding | Literal loopback/dedicated endpoint, denied service ports, no redirects, no cookies or external credentials |
| Lost acknowledgement / crash | Durable leases, bounded backoff, stable delivery IDs and receiver deduplication; real HTTP failure and restart tests |
| Queue loss on clinical commit | Outbox creation inside same source transaction; failure rolls back source/history/coding and review |
| Missing key or dependency | Fail closed, preserve work, restore stable root; no silent regenerated secret |
| Already in-flight send during revocation | Bounded two-second request; future claims cancelled. Transport cannot retract a request already sent |
| Large workloads and unsupported FHIR resources | Explicit single-resource/64-KiB contract and 200-row UI limit; bulk/reconciliation belongs to F04 |

Qualified clinical, architecture, privacy and licensing reviews remain pending. No production activation, complete SMART certification, general-purpose FHIR write server, licensed terminology validation or external EHR delivery is claimed.
