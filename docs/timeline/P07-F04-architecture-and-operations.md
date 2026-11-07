# P07-F04 architecture and operations

Local synthetic use only; qualified review remains pending and production clinical functions remain disabled. Schema remains 53.

Shared TimelineEventCard/TimelineEventList render canonical, filtered, comparison and materialized source facts. Clinical and recorded times remain distinct, date-only precision remains literal, missing metadata stays explicit. Canonical defaults to latest logical-record versions, with an explicit historical toggle. Date navigation and roving keyboard focus preserve API ordering.

TimelineSafety is patient-keyed. Network/source epochs synchronously gate visible data, abort old requests, clear inspectors and reset explorer pagination/baselines. Offline and reconnect require explicit reads; no clinical localStorage/IndexedDB or queued command replay is introduced. Source checks run at 30 seconds or visible focus with throttling while data is visible/online. They are detection, not live delivery. Manual Check source now uses the same readonly check. Check failures clear views; authoritative refresh re-establishes context.

GET /api/clinical-timeline/check accepts exactly one patient, requires same-origin/live source authorization, emits a success audit without clinical values, and returns only sourceHash, checkedAt and versionCount with no-store. checkedAt is operational server time. Existing source limits and permission/context rules apply.

Source inspection constructs the patient/event URL locally, reauthorizes every time and matches event ID, ledger, version and SHA before rendering. Structured values and optional exact JSON remain available. Native dialog plus explicit Tab wrapping, Escape/cancellation and trigger/fallback focus restoration support keyboard use. A valid formerly-current version may remain visible as historical evidence while lists clear. Denial, malformed evidence, network uncertainty and late responses never display unverified values.

To exercise: sign into the local clinical workspace, open a patient timeline, navigate dates/events, inspect source, toggle historical versions, open the explorer and inspect before/after entries. Correct a newly created synthetic observation using its actual source workflow; use Check source now to see stale views cleared, then Refresh. Disconnect/reconnect: facts clear and no process/rebuild command is replayed. Restore connectivity, then explicitly refresh. Materialized events remain subject to the existing canonical hash gate; existing worker consumes only authorized queued versions. Do not rebuild merely to hide a stale indicator.

No changes to source schema, clinical execution, production gates, licensing signoffs, retention or deployment. F05 projection lag alerts and Kafka replay remain separate work.
