# Terminology registry risk and user guidance

This local feature supports administrative terminology release management and synthetic code lookup. It is not a clinical decision service. It does not assert conformance to a licensed clinical terminology or activate clinical workflows.

| Hazard | Control | Evidence |
| --- | --- | --- |
| Semantic drift from editing a release | Immutable receipts, code-system records and pinned descriptions; new version required | Domain immutable/sealed-pin scenarios |
| Unknown, stale or foreign code accepted | Explicit system/version/code, effective interval and organization scope | Domain unknown/expired/tenant cases; API browser checks |
| Licensed content used without entitlement | Reference metadata only; official concept import and lookup denied | Domain content rejection; API rights checks |
| Retry creates duplicate releases | Actor-bound normalized-payload receipt in transaction | Domain replay/conflict and API retry checks |
| Partial record after failure | Atomic receipt, audit, pins and outbox; transactional migration marker | Forced outbox and DDL failures |
| Misleading clinical trust | Synthetic-only namespace, rights label and provenance digest explanation | Release detail UI and accessibility check |

Administrators open Terminology, enter the canonical system URI and an explicit version/edition/effective interval, and provide an HTTPS source reference and provenance note. Locally authored concepts require the organization namespace shown in the form. Review the manifest before registration; submitted releases cannot be edited. For correction, register a new version. Preserve the submission form when retrying after a network failure so the same idempotency key is used.

Other permitted staff can search registrations and inspect version, edition, provenance and concepts. A reference-only record intentionally contains no usable terminology content. An empty list means no registrations are present in the current organization; older clinical vocabularies are not silently promoted. Contact an organization administrator for access or a new registration. Mobile staff open the registry from Account and authenticate separately in the web workspace.

Reviewer status: automated engineering checks only. Human clinical, regulatory, licensing and formal phase reviews are not supplied by these documents. Pending Phase 02 reviews and the original formal phase statuses remain in force. Subsequent terminology features must not be represented as accepted on the basis of this feature's tests.
