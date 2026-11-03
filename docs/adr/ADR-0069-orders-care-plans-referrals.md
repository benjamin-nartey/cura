# ADR-0069 — Orders, care plans, and referrals

Status: experimental engineering. Not a production clinical authorization.

P04-F04 adds chart schema 41 for department requests, care plans, referrals, tasks, attachment references, and immutable work versions. The older `lab_orders`, `rx_orders`, `care_plans`, `care_referrals`, and `care_tasks` tables stay in place and are not the versioned coordination record.

A saved request has `fulfillment = not-transmitted`. Routing updates the local status only. It does not call a laboratory, imaging service, pharmacy, or external network. Medication drafts from P04-F03 stay non-executable. `clinical.sign`, prescribing, dispensing, and result authorization stay denied.

Double submission uses `work_commands`. The same key and body return the original order. A different body for that key conflicts. Concurrent submissions are serialized with `BEGIN IMMEDIATE`. Pending work is listed for the origin facility and the destination facility of a routed request. Another facility in the same organization does not see it unless the referral or department names that facility.

Historical versions cannot be updated or deleted. A closed visit encounter rejects a new request and still allows an authorized cancellation. Patient merge does not rewrite the stored patient id.
