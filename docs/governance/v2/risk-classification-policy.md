# Feature risk classification

Status: implemented conservative classifier for local engineering; deployment/FDA applicability remains a separate assessment.

| Class | Actual capability | Engineering treatment | Release boundary |
| --- | --- | --- | --- |
| A | Internal tooling and synthetic-data utilities | Automated gates; justified database/UI non-applicability only | No implicit access to real data or infrastructure |
| B | Scheduling, workforce, administrative billing | Full applicable technical gates | Legal, contractual, privacy and environment controls must be established |
| C | Authoritative chart, documentation, orders, medication, clinical exchange, emergency access | Full synthetic-data engineering permitted | Applicable clinical/safety/privacy/operational authorization required |
| D | Diagnostic AI, treatment recommendations, autonomous actions, image interpretation | Restricted synthetic engineering inside explicit scope | Separate validated regulatory/clinical release track |

The engine derives the highest class from declared actual capabilities and intended use. A lower selected label is rejected, unknown capability or missing/ambiguous use is RESTRICTED. P04-F05 is C because it includes authoritative clinical-chart workflows; its billing administration alone would be B. Classification metadata must be checked against source and tests during implementation. An automated label is not proof of medical-device exclusion.

Real patient information, consequences, external integrations, clinical influence, autonomy or changed intended use require reassessment. Clinical AI outputs remain derived, and no model may silently amend clinical source records. Tests ensure a label cannot suppress the capability-derived restriction. Unknown legal/regulatory applicability blocks the relevant release, not safe synthetic engineering.
