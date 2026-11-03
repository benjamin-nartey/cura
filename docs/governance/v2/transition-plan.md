# Governance v2 transition plan

Formal status: PROPOSED. Parallel engineering authority: explicit Product Owner request of 2026-11-03, recorded in `policy-request.json`; no reviewer signature is inferred.

The original constitution, amendment, signature records, Phase 02 reviews, formal progress registers and earlier evidence remain historical sources of truth. `historical-baseline.json` binds their current bytes. A changed historical record fails the new runner rather than being silently normalized. Legitimate future reconciliation requires an explicit documented transition and new baseline, preserving the old baseline as history.

The baseline retains original byte digests. Five known Windows CRLF text files additionally have LF digests so a Linux checkout can verify equivalent text without editing the historical files. That narrow cross-platform allowance does not apply to the amendment's fixed raw SHA-256 or to arbitrary content changes.

The Product Owner can direct local engineering in this parallel track. Existing accepted-decision rules do not establish unilateral authority to formally adopt a replacement constitution. Adoption therefore requires a separate decision satisfying the existing authorized process, including actual required reviewer decisions. No adoption date, reviewer name, signature or retrospective approval is generated.

Migration steps implemented: record the request; inventory the actual tree; preserve historical records; propose the U.S. baseline; implement/test classification, evidence and execution; freshly assess P04-F05; prepare a Phase 05 plan. Automatic feature progression applies only inside the authorized engineering scope and after current technical gates pass.

The original v1 checker and deployment restrictions remain available. v2 does not call the v1 checker in its mutating review mode. Ordinary v1 safety tests run as regression checks. Pending unrelated reviews remain visible without being represented as engineering failures in the authorized local track.

Rollback: stop the v2 runner and retain its immutable evidence; remove the added v2 CLI script registrations if desired. No application database rollback or clinical activation is required by this tooling migration. Do not delete historical evidence or overwrite any formal status.
