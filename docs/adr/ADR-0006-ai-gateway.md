# ADR-0006: The gateway refuses generation

Status: Accepted
Date: 2026-10-08

## Context
Phase 10 asks for a provider-neutral gateway: registries, quotas, redaction, structured output checks, and safe behavior when a provider is down. This slice has no model credentials and its intended use does not include clinical generation.

## Decision
Every attempt enters `invokeGateway`. The seeded prompt is disabled and marked `clinical-generation`. The seeded model is `unconfigured` and disabled. The organization token budget is 0. A clinical or disabled prompt returns `refused` with model `mdl_none` version `0` and no output. Input is redacted, then only its hash is stored. An adapter is not part of the HTTP route. Tests can attach an adapter only to an active non-clinical prompt; a thrown adapter becomes `unavailable`, a failed schema or blocked phrase becomes `invalid-output` with nothing stored, and a zero budget becomes `quota` without calling the adapter. Accepted output is not written into the evidence store.

## Consequences
The chart cannot receive model text from this gateway. Schema version 6 adds the registry and attempt tables. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed model is allowlisted, the clinical prompt is activated, and the budget is raised above zero.
