# Orders, care plans, and referrals

Experimental coordination behavior for P04-F04. This is not an order transmission interface and not a FHIR conformance claim.

## Records

Schema 41 stores `work_orders`, `work_plans`, `work_referrals`, `work_tasks`, `work_attachments`, and `work_versions`. Catalog codes use `curasphere.synthetic.order`, `curasphere.synthetic.care-plan`, and `curasphere.synthetic.referral`, version `2026.10`. Departments are Accra nursing, Madina laboratory, Madina imaging, and East Legon clinic.

Order status moves `submitted -> routed | cancelled`, then `routed -> cancelled`. Care plan status moves `active -> completed | cancelled`. Referral status moves `submitted -> accepted | declined | cancelled`, and `accepted -> cancelled`. Invalid moves are rejected. A stale version conflicts.

An attachment stores a catalog label, media type, byte length, and checksum. The file bytes are not stored and are not sent anywhere.

## Who can act

Doctors at the active facility can submit, route, cancel, plan, refer, assign, and read history. Nurses can read pending work and assign a task at their own facility. The Madina laboratory role can read the Madina queue, mark a request routed, assign the local task, and accept or decline a referral sent to Madina. Organization administrators and receptionists do not receive these grants. Auditors can read the queue and history.

## Screens

`/work` shows pending requests, tasks, referrals, and active care plans. Create screens require an open visit encounter. Detail screens show status, version, history, assignment, and cancellation. The request label says it is not a transmitted order.

## Out of scope

Laboratory resulting, pharmacy dispensing, prescription signing, billing, and external referral networks are not part of this feature.
