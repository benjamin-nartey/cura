# Monetization Architecture

## Commercial model
Use a platform subscription plus metered AI/compute and premium modules. Avoid unlimited AI on low tiers. Enterprise contracts add multi-facility administration, SSO/SCIM, data residency, private networking, dedicated support, advanced APIs and contractual SLOs.

## Metering units
- active facility / clinician / patient where commercially appropriate
- AI tokens or normalized AI credits
- transcription minutes
- document pages
- imaging studies processed
- storage and retention tiers
- integration/API volume
- premium analytics/research workspaces

## Billing principle
Clinical access must never be silently degraded in a way that creates unsafe care because an AI quota was exhausted. When paid AI capacity is unavailable, deterministic clinical workflows continue and the UI clearly indicates unavailable optional intelligence.
