# P06-F04 risk controls

| Hazard | Control and verification |
|---|---|
| Crash duplicates or drops clinical events | Atomic per-item source/history/outbox/outcome/cursor; file-backed kill-after-commit test and retained lease resume |
| Replayed page processes the next page unexpectedly | Durable request hash/end boundary, command-key replay and current cursor/version checks |
| Concurrent workers apply the same data | Serialized lease claim, per-item lease check and source idempotency; two-process race |
| Partial failure is presented as success | Explicit applied/queued-delivery/quarantined/blocked/conflict totals; completed means accounted for |
| Source changes after export capture | Immutable IDs/versions; version comparison and queue insertion share one transaction; conflict retained |
| Clinical review bypassed by authenticated transport | Separate clinician claim/preview/attestation and authoritative patient/encounter/source services |
| Quarantine edit manufactures acceptance | Original payload/hash immutable; recovery creates linked receipt, revalidates prerequisites and preserves original failure |
| Cached replay leaks data after policy change | Page runs persist progress-only metadata; response previews are reauthorized live |
| Old/revoked authority permits redrive | Current owner/session/subscription/connection/patient gates; disabled/ended remain terminal |
| Reset retries hides failures or duplicates remote facts | Immutable recovery history, three generations, stable delivery ID/body and actual receiver deduplication test |
| Cursor reveals a session or crosses scope | No plaintext session in token; hashed context, HMAC, expiry and filter binding; tamper/foreign-context tests |
| Oversized/malformed producer input | Exact signed byte limits, duplicate/unknown-field rejection and explicit bounded manifest limits |
| Source dependency outage skips clinical data | Stop at committed cursor; unavailable dependency is not classified as a successful or skipped item |

This is local synthetic engineering. Real PHI, production transfer, clinical/licensing/privacy approval and standards certification remain outside the authority. Native bulk administration and general HL7 Bulk Data support are not claimed. Existing F03 serialization is reused; F05 owns published conformance/R5 claims.
