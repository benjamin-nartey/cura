# ADR-0049: The product charter is a draft document

Status: Accepted
Date: 2026-10-13

## Context
Phase 00 requires a product charter before application work is treated as accepted. The phase exit criterion forbids application code beyond documentation tooling. `source/CuraSphere_Engineering_Specification_Pack_v1.0.docx` is not in this checkout. The phase specification reproduces the Phase 00 scope and exit criteria. `01-product/vision-principles.md` and `01-product/product-operating-model.md` already state the product principles.

## Decision
`docs/constitution/product-charter.json` is the charter. It names the customer, leaves the production jurisdiction unset, and links each proposed capability to a persona, an intended use, and either an administrative or clinical-impact workflow. Regulatory classification stays `pending`. `tools/constitution/validate-charter.mjs` checks that record. The charter stays a draft until a product owner records their name and the approval date. This decision does not approve the charter and does not authorize Phase 01.

## Consequences
Documentation tooling can reject an incomplete charter. The feature stays blocked while approval is pending. Rollback is to remove `docs/constitution/product-charter.json`, `docs/constitution/product-charter.md`, and `tools/constitution/`. No database migration is involved.

## Approval record
On 2026-10-13T13:26:00Z, Benjamin Tetteh Nartey, product owner, approved `charter-2026.10`. The pending draft remains in the charter's approval history. This record does not approve any later feature, regulatory classification, or clinical validation.

## Revisit trigger
A product owner records their approval on the charter. Do not start the intended-use registry until that approval exists.
