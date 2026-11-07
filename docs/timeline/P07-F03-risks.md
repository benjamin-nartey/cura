# P07-F03 hazards and controls

| Hazard | Control |
| --- | --- |
| Silent contradictory correction | Latest-per-record default and one amended before→after comparison; explicit history badges and exact source inspection. |
| Late/backdated event missed | Source-version membership for snapshots; recorded-time baseline for visits, separate from clinical-time filters. |
| Invented ordering at visit closure | Boundary-uncertain result with no definitive before version; explicit no-prior-visit and corrupt-evidence failures. |
| Mixed or tampered pages | Domain-separated HMAC, source/coverage/session/filter/baseline pin, bounded keyset continuation and 409 restart. |
| Baseline corruption or unauthorized reuse | Immutable owner/context-bound references, member count/digest and exact ledger/hash revalidation. |
| Revoked access, wrong tenant/facility/patient | F01 current source authorization at every operation, additional authoritative encounter gate, scoped snapshot ownership. |
| Origin-based clinical mutation | Existing correction endpoint now checks source origin; actual foreign-origin attempt leaves v1 intact before legitimate v2 amendment. |
| Stale/offline client facts | No-store, aborted navigation/cancellation, errors clear views, no implicit clinical cache. |
| Unbounded storage/work | Existing 500-version read bound; 1–50-page bound; 100 retained owner/patient snapshots; 2-KiB streaming capture body. |

No AI/model facts or clinical execution is added. Structured audits omit values/tokens. Genuine clinical/privacy/architecture/licensing and retention reviews remain pending; local synthetic evidence is not certification or formal production acceptance.
