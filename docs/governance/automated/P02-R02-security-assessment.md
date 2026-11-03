# Automated security evidence

This is automated technical evidence. It is not a human architecture, security, or clinical approval. It does not change P02-R01 through P02-R06, and it is not a certification.

- Review: P02-R02
- Evaluated at: 2026-10-14T13:37:15.248Z
- Revision: 84f0fc06044237aed8b2c98ca031f19333e3e8bb
- Working tree dirty: true
- Automated result: AUTOMATED_EVIDENCE_WITH_FAILURES
- Development exception: PROPOSED
- Phase 03: NOT_AUTHORIZED

| Control | Framework | Result | Evidence |
| --- | --- | --- | --- |
| SEC-DOMAIN-SUITE | OWASP-ASVS-5.0 | PASS | # tests 208 # suites 0 # pass 208 # fail 0 # cancelled 0 # skipped 0 # todo 0 # duration_ms 48424.338 |
| SEC-CONSTITUTION | NIST-CSF-2.0 | PASS | # tests 19 # suites 0 # pass 19 # fail 0 # cancelled 0 # skipped 0 # todo 0 # duration_ms 368.414 |
| SEC-NPM-DOMAIN | ISO-IEC-27001 | PASS | found 0 vulnerabilities |
| SEC-NPM-WEB | ISO-IEC-27001 | PASS | found 0 vulnerabilities |
| SEC-GATEWAY | NIST-CSF-2.0 | PASS | FastAPI 0.143.0, Starlette 1.8.0, Python 3.13.1. |
| SEC-PIP-AUDIT | NIST-CSF-2.0 | PASS | WARNING:pip_audit._cli:--no-deps is supported, but users are encouraged to fully hash their pinned dependencies WARNING:pip_audit._cli:Consider using a tool like `pip-compile`: https://pip-tools.readthedocs.io/en/latest/#using-hashes No known vulnerabilities found |
| SEC-IMAGE | NIST-CSF-2.0 | FAIL | │               │ CVE-2026-78409 │          │              │                                   │               │ util-linux: util-linux: X-mount.subdir detached-tree        │ │               │                │          │              │                                   │               │ resolution can escape via intermediate symlinks             │ │               │                │          │              │                                   │               │ https://avd.aquasec.com/nvd/cve-2026-78409                  │ │               ├────────────────┤          │              │                                   ├───────────────┼─────────────────────────────────────────────────────────────┤ │               │ CVE-2026-78410 │          │              │                                   │               │ util-linux: util-linux: restricted bind mounts do not pin   │ │               │                │          │              │                                   │               │ the source, allowing X-mount.owner/group/mode...            │ │               │                │          │              │                                   │               │ https://avd.aquasec.com/nvd/cve-2026-78410                  │ └───────────────┴────────────────┴──────────┴──────────────┴───────────────────────────────────┴───────────────┴─────────────────────────────────────────────────────────────┘ |
| SEC-HOSTED-CI | NIST-CSF-2.0 | NOT_VERIFIED | http 200 conclusion failure sha 84f0fc06044237aed8b2c98ca031f19333e3e8bb url https://github.com/benjamin-nartey/cura/actions/runs/38533405132 gh is not installed. This is not branch-protection evidence and it does not cover the unpushed working tree. |

## Outstanding

- SEC-IMAGE: │               │ CVE-2026-78409 │          │              │                                   │               │ util-linux: util-linux: X-mount.subdir detached-tree        │ │               │                │          │              │                                   │               │ resolution can escape via intermediate symlinks             │ │               │                │          │              │                                   │               │ https://avd.aquasec.com/nvd/cve-2026-78409                  │ │               ├────────────────┤          │              │                                   ├───────────────┼─────────────────────────────────────────────────────────────┤ │               │ CVE-2026-78410 │          │              │                                   │               │ util-linux: util-linux: restricted bind mounts do not pin   │ │               │                │          │              │                                   │               │ the source, allowing X-mount.owner/group/mode...            │ │               │                │          │              │                                   │               │ https://avd.aquasec.com/nvd/cve-2026-78410                  │ └───────────────┴────────────────┴──────────┴──────────────┴───────────────────────────────────┴───────────────┴─────────────────────────────────────────────────────────────┘
- SEC-HOSTED-CI: http 200 conclusion failure sha 84f0fc06044237aed8b2c98ca031f19333e3e8bb url https://github.com/benjamin-nartey/cura/actions/runs/38533405132 gh is not installed. This is not branch-protection evidence and it does not cover the unpushed working tree.
