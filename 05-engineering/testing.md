# Testing Strategy

## Pyramid
Unit -> component -> integration -> contract -> E2E -> performance -> chaos -> security -> clinical/AI validation.

## Mandatory security tests
Authorization matrix, tenant isolation, IDOR, mass assignment, injection, SSRF, file handling, rate limits, secrets leakage, prompt injection, tool abuse and cross-patient context contamination.

## Interoperability tests
FHIR validation, code-system validation, round-trip mapping, malformed messages, duplicate messages, retries and out-of-order events.

## Release blocking
Critical safety/security regression, tenant isolation failure, data loss, migration non-reversibility without approved plan, unmet SLO qualification or failed AI evaluation blocks release.
