# P09-F04 revocation and invalidation

The local synthetic continuation evaluates invalidation on authorized reads. The claim list, revision history, and command receipts check direct citations and annotated relationships against the current source inventory. The relationship resolver uses the same source identity and integrity checks as Evidence sources and exact inspection.

Correction or removal makes a revision with any unavailable dependency withhold its text and citations. The relationship and sufficiency views reflect the resulting stale state. Revoked access is enforced before returning claim or source content. The browser checks access on its existing refresh cadence and clears draft and displayed content if a claim revision or dependency state changes. It closes history during rechecks so an older revision cannot linger when the current revision is unaffected.

Immutable revisions remain the audit history. The system rechecks live source evidence when a user opens or refreshes a claim. A clinician can append a new revision after reviewing the current sources. The implementation uses schema 59 and the existing synchronous source gates. The browser refresh interval governs when a view already on screen sees a change.


## Engineering verification

On 2026-11-07, all 32 graph and ingestion tests passed. They cover source correction, isolated removal of a shared document, permission boundaries, stale sufficiency, and explicit revision after source review. The document removal test also checks that the claim context fingerprint changes.

Targeted lint and the optimized Next build passed. The browser regression created and corrected a synthetic observation and verified that the claim list withheld both the directly cited claim and the claim linked through an annotation. The reviewed revision used source version 2 while revision 1 stayed withheld. Browser results are in artifacts/governance-v2/P09-F04/e2e-correction.json.
