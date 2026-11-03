# Phase 02 residual risk

Date: 2026-10-14

| ID | Risk | Owner role | Required action | State |
| --- | --- | --- | --- | --- |
| R-01 | Architecture review unsigned | Architecture reviewer | Decide P02-R01 | Open |
| R-02 | Security review unsigned | Security reviewer | Decide P02-R02 | Open |
| R-03 | Clinical safety boundary unsigned | Clinical reviewer | Decide P02-R03 | Open |
| R-04 | Role matrix unapproved | Clinical reviewer | Decide P02-R04. Do not treat proposed grants as policy | Open |
| R-05 | Emergency duration and freshness are engineering defaults | Clinical reviewer | Decide P02-R05. 5 minutes and 15 minutes are not approved | Open |
| R-06 | Product-owner phase acceptance unsigned | Product owner | Decide P02-R06 after the reviews that governance requires | Open |
| R-07 | Gateway Debian high findings not re-scanned in this closeout | Engineering | Rescan before image promotion. Last scan is the Phase 01 record | Open, carried from Phase 01 |
| R-08 | FastAPI 0.115.6 still pinned | Engineering | Upgrade on its own change, outside this identity phase, if the security reviewer requires it | Open, carried from Phase 01 |
| R-09 | No hosted Actions run observed at Phase 01 | Repository administrator | Push and run `verify` when a credential works. This closeout records the new `gh` result in the completion report | Open |
| R-10 | Local Cosign key, not hosted provenance | Engineering | Do not describe the Phase 01 signature as keyless provenance | Open |
| R-11 | Alert and invitation outboxes are local sandboxes | Operations, when assigned | Do not claim external delivery | Open |
| R-12 | Consent, privacy, and retention absent | Phase 03 | Do not start Phase 03 from this packet | Open |
| R-13 | Production jurisdiction unset | Product owner | Select a jurisdiction before any production clinical use | Open |

No row is accepted by this document.
