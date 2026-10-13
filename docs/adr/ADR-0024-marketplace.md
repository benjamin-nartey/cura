# ADR-0024: Directory listings, no extension runtime

Status: Accepted
Date: 2026-10-08

## Context
Phase 28 asks for a developer portal, OAuth app registration, sandbox tenants, a model and app manifest, a review workflow, billing and revenue share, and a kill switch. No OAuth server, sandbox organization, extension host, or payout service is connected. Inventing any of those would be a production mock.

## Decision
An organization admin can store an administrative listing. The only scope is `health.read`. The only risk class is `administrative`. A package larger than 1024 characters is refused. A secret, a redirect URI, a wider scope, a clinical risk class, and a compatibility string other than `marketplace-compat-2026.10` are refused. An auditor in the same organization can store one hold review. The registering admin cannot review it. A release is refused, so a reviewed listing is not installed. A share row stays `not-billed`, and an amount or percent is refused. The kill switch sets the listing to `stopped` and does not signal a process. OAuth issuance and sandbox creation are refused and write no credential and no organization. An explain call goes through the AI Gateway and does not change a listing.

## Consequences
Schema version 24 adds the marketplace tables. There is no secret column and no amount column. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
An extension host and an OAuth authorization server are actually connected. Until then, listings stay in this directory.
