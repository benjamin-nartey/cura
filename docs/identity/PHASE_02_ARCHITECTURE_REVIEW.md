# Phase 02 architecture review packet

Review ID: P02-R01
Status: PENDING
Date prepared: 2026-10-14

Decision requested: ACCEPT, REQUEST CHANGES, or REJECT the architecture described in ADR-0056, ADR-0057, ADR-0058, ADR-0059, ADR-0060, and proposed ADR-0061. Do not treat this packet as that decision.

## What was built
Organizations, facilities, memberships, and service principals. Dex for workforce password login. Application TOTP and passkeys. Server-side session context. One `authorize()` function with default deny. Workforce invitations and lifecycle on the existing membership tables. Emergency access as a narrow exception after ordinary denial, only for a synthetic read.

## Boundaries the reviewer is asked to confirm
Foundation schema history and chart schema history stay separate. Chart schema 32 does not add a Flyway migration. Emergency lookup runs only after hard denials and only for `SyntheticRestrictedRecord` and `synthetic.read`. A client `emergency` flag still returns `emergency-disabled`. Grant, review, and local alert rows are one transaction. Phase 03 is the audit, consent, and retention boundary. Phase 04 is the clinical-resource boundary.

## Tradeoffs
Chart and foundation both store tenancy. The web session uses the foundation session id and chart membership for authorization. That split is documented in ADR-0056. A later consolidation is not part of this phase.

Dex does not enroll MFA. The application does. Assurance is recorded on the chart session, not asserted by the browser.

Local outboxes capture invitation and emergency alerts. They are not external delivery.

Clinical role text on memberships is not an approved clinical policy. `authorize()` uses proposed permissions and still denies unimplemented clinical actions such as prescribing and signing.

## Unresolved
No architecture reviewer is named on this review. Production jurisdiction is unset. The chart and foundation tenancy stores are not merged.

## If rejected or changes are requested
Phase 02 stays unaccepted. The specific design that failed is remediated before another review. Phase 03 does not start.
