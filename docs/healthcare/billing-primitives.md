# Billing primitives

Experimental synthetic charge behavior for P04-F05. This is not a payment system, claims platform, or approved tariff.

## Records

Schema 42 stores `billing_catalog`, `billing_charges`, `billing_charge_items`, `billing_adjustments`, `billing_versions`, `billing_commands`, `billing_metrics`, and `billing_controls`. Amounts are integer minor units. Accra catalog prices use GHS with two minor digits. Totals are calculated on the server. Currencies are not mixed.

Charge status moves `recorded -> reviewed | voided`, `reviewed -> finalized-local | voided`, and `finalized-local -> voided`. Local finalization does not issue an invoice. Transmission and collection stay denied.

Catalog rows keep an explicit version. Charge items snapshot the catalog display, unit price, currency, and catalog version. Adjustments create a new charge version. They do not overwrite the original amount.

## Who can act

Billing officers at the active facility can create, read, review, finalize locally, adjust, void, and read history. Doctors may see a status indicator without amounts (`billing.charge.status`). Organization administrators do not inherit charge privileges. Auditors may read charges and history. Receptionists cannot modify prices or charges.

## Screens

`/billing` lists synthetic charges. `/billing/charges/new` creates a charge against an encounter. Detail and history screens show status, version, catalog snapshot, and adjustments. The chart billing section respects the same grants.

## Out of scope

Payment collection, Paystack, insurance claims, settlement, refunds, bank reconciliation, AI coding, and production invoices are not part of this feature.
