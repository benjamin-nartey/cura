# ADR-0020: Device readings are typed, not streamed

Status: Accepted
Date: 2026-10-08

## Context
Phase 24 asks for a device registry, device identity, stream ingestion, normalization, connectivity status, and threshold workflows. This store has no wearable gateway and no paging service. Marking a device online, or opening a live stream, would be a production mock.

## Decision
A clinician or nurse registers a device for a patient at the session facility. The kind is one of three pinned kinds, and the code is the matching facility-catalog concept. Connectivity is always `not-connected`. A reading is one typed value at a stated time. The unit, code, and catalog versions are copied from the facility catalog. The same device, code, and time with the same value returns the existing reading. A different value at that time is refused. A time earlier than a stored reading is kept and marked `out-of-order`, and it does not open an alert. An in-order value outside the catalog bound opens one threshold mark until three marks are open for that patient. The next crossing stores an escalation sentence and does not open a fourth mark. No page is sent. Readings are not copied into chart observations. An explain call goes through the AI Gateway, which refuses clinical generation.

## Consequences
Schema version 20 adds the device tables. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A real device gateway is connected. Connectivity may then change from a stored heartbeat. Paging stays out of this slice until a paging destination exists.
