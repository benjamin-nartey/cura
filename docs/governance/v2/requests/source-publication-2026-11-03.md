# Source publication authorization — 2026-11-03

The Product Owner explicitly instructed: “commit, merge and push to remote origin”.

This authorizes committing the current local engineering work, merging it into the repository's primary branch, and pushing to `https://github.com/benjamin-nartey/cura.git`. It supersedes the earlier prohibition on these Git operations for this delivery only.

It does not adopt governance v2 formally, sign pending historical reviews, authorize real patient data, or authorize staging/production deployment or clinical use. Earlier requests, signatures, phase statuses and acceptance evidence keep their original meanings. Hosted CI results remain separate from local verification.

The mobile source was an embedded repository represented by a gitlink without `.gitmodules` or an origin remote. Delivery includes the source directly in the monorepo; its original local Git metadata is retained in an ignored repository backup. Runtime SQLite databases, local credentials, dependency directories and caches are excluded.
